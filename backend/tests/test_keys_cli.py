"""Signing-key backup, restore, rotation and revocation."""

import json
import os
import time

import pytest

from app.receipts import Keyring, Signer, build_receipt, verify_receipt
from scripts import keys

PROV = {"sources": ["lfd"], "quantum": True, "quantum_bytes": 64, "mixed_with": "os_csprng"}
PASS = "correct horse battery staple 42"


def sign(signer):
    r, _ = build_receipt(signer, "password", PROV, entropy_bits=100.0, secret_value="x", details={"length": 8})
    return r


def test_backup_restore_round_trip():
    s = Signer.generate()
    blob = keys.backup(s, PASS, log_n=14)
    assert "ed25519" not in json.dumps(blob["kdf"]) and s.seeds()["ed25519"] not in json.dumps(blob)
    restored = keys.restore(blob, PASS)
    assert restored.public_keys() == s.public_keys()
    r = sign(restored)
    assert verify_receipt(r["payload"], r["signatures"], Keyring(s))["valid"]


def test_wrong_passphrase_and_tampering_fail():
    blob = keys.backup(Signer.generate(), PASS, log_n=14)
    with pytest.raises(ValueError, match="wrong passphrase"):
        keys.restore(blob, PASS + "!")
    tampered = dict(blob, key_id="0" * 16)  # key_id is bound as associated data
    with pytest.raises(ValueError):
        keys.restore(tampered, PASS)
    with pytest.raises(ValueError, match="unsupported"):
        keys.restore({**blob, "kdf": {**blob["kdf"], "log_n": 4}}, PASS)  # refuse weakened KDF parameters


def test_rotation_keeps_old_receipts_valid():
    old = Signer.generate()
    receipt = sign(old)
    new, retired = keys.rotate(old, [])
    ring = Keyring(new, retired)
    assert verify_receipt(receipt["payload"], receipt["signatures"], ring)["valid"]
    assert verify_receipt(receipt["payload"], receipt["signatures"], ring)["key_status"] == "retired"
    fresh = sign(new)
    assert verify_receipt(fresh["payload"], fresh["signatures"], ring)["key_status"] == "active"


def test_revocation_rejects_receipts_from_revoked_at_onwards():
    old = Signer.generate()
    before = sign(old)
    new, retired = keys.rotate(old, [])
    kid = old.public_keys()["key_id"]
    ring = Keyring(new, keys.revoke(retired, kid, at=before["payload"]["issued_at"] + 1))
    assert verify_receipt(before["payload"], before["signatures"], ring)["valid"]  # issued before revocation
    ring = Keyring(new, keys.revoke(retired, kid, at=before["payload"]["issued_at"]))
    v = verify_receipt(before["payload"], before["signatures"], ring)
    assert not v["valid"] and v["reason"] == "revoked_key"
    with pytest.raises(ValueError, match="rotate before"):
        keys.revoke(retired, new.public_keys()["key_id"], at=1, active_key_id=new.public_keys()["key_id"])
    with pytest.raises(ValueError, match="not in the retired"):
        keys.revoke(retired, "f" * 16, at=1)


def test_cli_end_to_end(tmp_path, monkeypatch, capsys):
    monkeypatch.setenv("QPG_BACKUP_PASSPHRASE", PASS)
    key_file = tmp_path / "signing_key.json"
    original = Signer.load_or_create(str(key_file))
    kid = original.public_keys()["key_id"]

    assert keys.main(["show-public", "--key-file", str(key_file)]) == 0
    assert json.loads(capsys.readouterr().out)["key_id"] == kid

    backup = tmp_path / "backup.qpgkey"
    assert keys.main(["backup", "--key-file", str(key_file), "--out", str(backup), "--scrypt-log-n", "14"]) == 0
    assert oct(os.stat(backup).st_mode & 0o777) == "0o600"

    assert keys.main(["rotate", "--key-file", str(key_file)]) == 0
    retired = json.loads(capsys.readouterr().out)
    assert retired[0]["key_id"] == kid and retired[0]["status"] == "retired"
    assert (tmp_path / f"signing_key.json.{kid}.retired").exists()
    assert Signer.load_or_create(str(key_file)).public_keys()["key_id"] != kid

    # Restore refuses to overwrite the live key unless forced.
    with pytest.raises(SystemExit):
        keys.main(["restore", "--in", str(backup), "--key-file", str(key_file)])
    assert keys.main(["restore", "--in", str(backup), "--key-file", str(key_file), "--force"]) == 0
    assert Signer.load_or_create(str(key_file)).public_keys()["key_id"] == kid

    (tmp_path / "retired.json").write_text(json.dumps(retired))
    now = int(time.time())
    assert keys.main(["revoke", "--key-id", kid, "--at", str(now), "--retired", str(tmp_path / "retired.json")]) == 0
    out = json.loads(capsys.readouterr().out)
    assert out[0]["status"] == "revoked" and out[0]["revoked_at"] == now


def test_short_passphrase_rejected(monkeypatch, tmp_path):
    monkeypatch.setenv("QPG_BACKUP_PASSPHRASE", "short")
    key_file = tmp_path / "k.json"
    Signer.load_or_create(str(key_file))
    with pytest.raises(SystemExit):
        keys.main(["backup", "--key-file", str(key_file), "--out", str(tmp_path / "b")])
