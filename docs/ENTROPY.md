# QuantumPass entropy assumptions and limitations

QuantumPass draws fresh OS CSPRNG bytes for each entropy stream and combines them with available third-party or QPU output through HKDF-SHA512. Output is expanded using HMAC-SHA512 counter mode. The service uses rejection sampling to eliminate simple modulo bias from password/draw selection.

**Security baseline:** assuming the OS CSPRNG behaves securely and the HKDF/HMAC construction behaves as modeled, untrusted external input should not reduce output unpredictability below the OS baseline. This is a conditional engineering assumption, not a mathematical guarantee under compromised hosts or arbitrary implementation faults.

**Source health tests:** RCT/APT in `app/entropy/health.py` are *SP 800-90B-inspired* tests applied to the available samples. They do **not** represent NIST entropy source validation, an ESV certificate, or independent device characterization. The current threshold estimates are design inputs, not measured min-entropy certifications.

**Provider trust:** IBM job IDs and device labels are operator-asserted. The QPU/simulator setting is included in provenance to avoid incorrectly labeling simulator output as quantum. External QRNG providers may fail, rate-limit, return biased data or change service behavior. Failed sources are excluded when possible; the OS CSPRNG remains available.

**Capacity:** QPU Open Plan budgets and availability change; do not promise the number of hardware-seeded requests without measuring real QPU time, pool depletion, number of distinct seeds, and provider quotas. When the hardware pool drains, the service can use other healthy providers or OS-only entropy, with honest labels.

**Information shown to users:** entropy_bits of a password is the log2 of its uniformly sampled output space (conditioned on selected character-class constraints), **not** a direct measurement of qubit min-entropy or a certification of output randomness.

Before launch, commission an independent cryptographic design review, establish per-source data collection/min-entropy assumptions, validate failover, perform statistical tests on representative sample populations, and archive reproducible test vectors.
