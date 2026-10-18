"""Run one real IBM Quantum harvest job and report what came back.

    cd backend && pip install -e ".[ibm]"
    IBM_QUANTUM_TOKEN=... IBM_QUANTUM_INSTANCE=crn:v1:... POOL_PATH=./entropy_pool.bin python -m scripts.ibm_harvest

Dry run of the same pipeline on a local simulator first (no token, no QPU time):
    IBM_MODE=simulator python -m scripts.ibm_harvest

The conditioned bytes are saved to POOL_PATH, which the server loads at startup.
"""

import asyncio
import sys

from app.config import get_settings
from app.entropy.ibm import IBMHarvester
from app.entropy.pool import EntropyPool


async def main() -> int:
    s = get_settings()
    simulator = s.ibm_mode == "simulator"
    if not simulator and not s.ibm_quantum_token:
        print("Set IBM_QUANTUM_TOKEN (IBM Cloud API key) and IBM_QUANTUM_INSTANCE (instance CRN).")
        return 1
    pool = EntropyPool(s.pool_path)
    h = IBMHarvester(pool, s.ibm_quantum_token, s.ibm_quantum_instance, s.ibm_backend, s.ibm_shots, 0, 0, 1,
                     simulator=simulator, sim_qubits=s.ibm_sim_qubits)
    print("Running on local Aer simulator (NOT quantum)..." if simulator
          else "Submitting job to IBM Quantum (queue time varies)...")
    n = await h.harvest_once()
    if not n:
        print(f"Harvest rejected: {h.last_error}")
        return 1
    print(f"Backend {h.last_backend}, job {h.last_job_id}: +{n} conditioned bytes, pool now {len(pool)} bytes")
    print(f"Health: RCT cutoff {h.monitor.rct_c}, APT cutoff {h.monitor.apt_c}, samples {h.monitor.samples}")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
