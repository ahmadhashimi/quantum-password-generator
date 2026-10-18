"""Signing-key operations: inspect, back up, restore, rotate, revoke.

    python -m scripts.keys show-public  --key-file data/signing_keys.json
    python -m scripts.keys backup       --key-file data/signing_keys.json --out key-backup.qpgkey   (or --out -)
    python -m scripts.keys restore      --in key-backup.qpgkey --key-file data/signing_keys.json
    python -m scripts.keys rotate       --key-file data/signing_keys.json [--retired retired.json]
    python -m scripts.keys revoke       --key-id 0123456789abcdef --at 1767225600 --retired retired.json

Backups are encrypted with a passphrase (scrypt -> AES-256-GCM); the passphrase comes from QPG_BACKUP_PASSPHRASE
or an interactive prompt and never from the command line, so it can't end up in shell history or `ps`.
Rotation and revocation print the new RETIRED_SIGNING_KEYS value; nothing is applied until you set it and
restart the server, which records the change in the audit log. See docs/RUNBOOK.md.
"""

import argparse
import base64
import getpass
import json
import os
import secrets
import sys
import time
from pathlib import Path

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.scrypt import Scrypt

from app.receipts import Keyring, Signer

BACKUP_FORMAT = "qpg-key-backup/1"
SCRYPT_LOG_N = 17  # 2^17 x r=8 -> 128 MiB of memory per guess


def _b64(data: bytes) -> str:
    return base64.b64encode(data).decode()


def _passphrase(confirm: bool) -> str:
    pw = os.environ.get("QPG_BACKUP_PASSPHRASE")
    if pw is None:
        pw = getpass.getpass("Backup passphrase: ")
        if confirm and getpass.getpass("Repeat passphrase: ") != pw:
            raise SystemExit("Passphrases don't match")
    if len(pw) < 16:
        raise SystemExit("Use a passphrase of at least 16 characters")
    return pw


def _kdf(passphrase: str, salt: bytes, log_n: int) -> bytes:
    return Scrypt(salt=salt, length=32, n=1 << log_n, r=8, p=1).derive(passphrase.encode())


def write_private(path: Path, data: str, *, overwrite: bool = False) -> None:
    """Atomically write a 0600 file; refuses to replace an existing file unless overwrite=True."""
    if path.exists() and not overwrite:
        raise SystemExit(f"{path} exists; refusing to overwrite it")
    tmp = path.with_name(f".{path.name}.{secrets.token_hex(6)}.tmp")
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    try:
        with os.fdopen(fd, "w") as f:
            f.write(data)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, path)
    finally:
        tmp.unlink(missing_ok=True)


def load_signer(path: Path) -> Signer:
    if not path.exists():
        raise SystemExit(f"{path} not found")
    return Signer.load_or_create(str(path))  # enforces owner-only permissions


def backup(signer: Signer, passphrase: str, log_n: int = SCRYPT_LOG_N) -> dict:
    salt, nonce = os.urandom(16), os.urandom(12)
    key_id = signer.public_keys()["key_id"]
    aad = f"{BACKUP_FORMAT}:{key_id}".encode()
    ct = AESGCM(_kdf(passphrase, salt, log_n)).encrypt(nonce, json.dumps(signer.seeds()).encode(), aad)
    return {"format": BACKUP_FORMAT, "key_id": key_id, "public": signer.public_keys(), "created_at": int(time.time()),
            "kdf": {"name": "scrypt", "log_n": log_n, "r": 8, "p": 1, "salt": _b64(salt)},
            "cipher": {"name": "aes-256-gcm", "nonce": _b64(nonce)}, "ciphertext": _b64(ct)}


def restore(blob: dict, passphrase: str) -> Signer:
    if blob.get("format") != BACKUP_FORMAT:
        raise ValueError("not a QuantumPass key backup")
    kdf, key_id = blob["kdf"], blob["key_id"]
    if kdf.get("name") != "scrypt" or not 14 <= int(kdf["log_n"]) <= 22 or kdf.get("r") != 8 or kdf.get("p") != 1:
        raise ValueError("unsupported key derivation parameters")
    key = _kdf(passphrase, base64.b64decode(kdf["salt"]), int(kdf["log_n"]))
    try:
        seeds = AESGCM(key).decrypt(base64.b64decode(blob["cipher"]["nonce"]), base64.b64decode(blob["ciphertext"]),
                                    f"{BACKUP_FORMAT}:{key_id}".encode())
    except InvalidTag:
        raise ValueError("wrong passphrase or corrupted backup") from None
    signer = Signer.from_seeds(json.loads(seeds))
    if signer.public_keys()["key_id"] != key_id:
        raise ValueError("restored key does not match the backup's key_id")
    return signer


def rotate(old: Signer, retired: list[dict]) -> tuple[Signer, list[dict]]:
    """A fresh signer, plus the retired list with the old public key appended (validated by Keyring)."""
    new = Signer.generate()
    entry = {**old.public_keys(), "status": "retired"}
    updated = [k for k in retired if k.get("key_id") != entry["key_id"]] + [entry]
    Keyring(new, updated)  # raises if any entry is malformed
    return new, updated


def revoke(retired: list[dict], key_id: str, at: int, active_key_id: str | None = None) -> list[dict]:
    if key_id == active_key_id:
        raise ValueError("rotate before revoking the active key")
    if not any(k.get("key_id") == key_id for k in retired):
        raise ValueError(f"{key_id} is not in the retired key list")
    return [{**k, "status": "revoked", "revoked_at": at} if k.get("key_id") == key_id else k for k in retired]


def _read_retired(path: str | None) -> list[dict]:
    if not path:
        return json.loads(os.environ.get("RETIRED_SIGNING_KEYS") or "[]")
    return json.loads(Path(path).read_text())


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="QuantumPass signing-key operations")
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("show-public")
    p.add_argument("--key-file", required=True)
    p = sub.add_parser("backup")
    p.add_argument("--key-file", required=True)
    p.add_argument("--out", required=True)
    p.add_argument("--scrypt-log-n", type=int, default=SCRYPT_LOG_N, help=argparse.SUPPRESS)
    p = sub.add_parser("restore")
    p.add_argument("--in", dest="inp", required=True)
    p.add_argument("--key-file", required=True)
    p.add_argument("--force", action="store_true", help="replace an existing key file")
    p = sub.add_parser("rotate")
    p.add_argument("--key-file", required=True)
    p.add_argument("--retired", help="JSON file with the current RETIRED_SIGNING_KEYS (default: that env var)")
    p = sub.add_parser("revoke")
    p.add_argument("--key-id", required=True)
    p.add_argument("--at", type=int, default=None, help="unix time from which receipts are rejected (default: now)")
    p.add_argument("--retired", help="JSON file with the current RETIRED_SIGNING_KEYS (default: that env var)")
    p.add_argument("--key-file", help="active key file, to refuse revoking the active key")
    a = ap.parse_args(argv)

    try:
        if a.cmd == "show-public":
            print(json.dumps(load_signer(Path(a.key_file)).public_keys(), indent=2))
        elif a.cmd == "backup":
            blob = backup(load_signer(Path(a.key_file)), _passphrase(confirm=True), a.scrypt_log_n)
            if a.out == "-":  # stream to stdout (e.g. out of a read-only container); the blob is encrypted
                print(json.dumps(blob, indent=2))
            else:
                write_private(Path(a.out), json.dumps(blob, indent=2))
            print(f"Encrypted backup of key {blob['key_id']} written to {a.out}. Store it offline, apart from the "
                  "passphrase.", file=sys.stderr)
        elif a.cmd == "restore":
            signer = restore(json.loads(Path(a.inp).read_text()), _passphrase(confirm=False))
            write_private(Path(a.key_file), json.dumps(signer.seeds()), overwrite=a.force)
            print(f"Restored key {signer.public_keys()['key_id']} to {a.key_file}", file=sys.stderr)
        elif a.cmd == "rotate":
            path = Path(a.key_file)
            old = load_signer(path)
            new, retired = rotate(old, _read_retired(a.retired))
            archived = path.with_name(f"{path.name}.{old.public_keys()['key_id']}.retired")
            write_private(archived, path.read_text())
            write_private(path, json.dumps(new.seeds()), overwrite=True)
            print(f"Active key is now {new.public_keys()['key_id']}. The old private key was moved to {archived}: "
                  "back it up offline or destroy it. Set RETIRED_SIGNING_KEYS to the JSON below and restart.",
                  file=sys.stderr)
            print(json.dumps(retired))
        elif a.cmd == "revoke":
            active = load_signer(Path(a.key_file)).public_keys()["key_id"] if a.key_file else None
            updated = revoke(_read_retired(a.retired), a.key_id, a.at if a.at is not None else int(time.time()),
                             active)
            print("Set RETIRED_SIGNING_KEYS to the JSON below and restart. Receipts this key signed at or after "
                  "revoked_at will verify as invalid.", file=sys.stderr)
            print(json.dumps(updated))
    except (ValueError, KeyError, json.JSONDecodeError) as e:
        print(f"error: {e}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
