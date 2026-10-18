"""IBM Quantum harvester: Hadamard + measure on every qubit of a real QPU, many shots.

Runs in the background (QPU queues take minutes to hours), health-tests the raw bits, conditions
them to remove readout bias, and tops up the EntropyPool. Requires the optional `ibm` extra:
    pip install "qiskit>=2.0" "qiskit-ibm-runtime>=0.42"

Credentials: an IBM Cloud API key plus the instance CRN. Passing the CRN pins every job to that instance,
so usage is charged only there (keep it an Open Plan instance to stay free).
"""

import asyncio
import logging
import time

from .health import HealthMonitor
from .mixer import condition
from .pool import EntropyPool

log = logging.getLogger(__name__)

# Raw QPU bits carry readout bias/crosstalk; assess conservatively at 2 bits of min-entropy per byte.
RAW_MIN_ENTROPY = 2.0


def bitstrings_to_bytes(bitstrings: list[str]) -> bytes:
    bits = "".join(bitstrings)
    usable = len(bits) - len(bits) % 8
    return int(bits[:usable], 2).to_bytes(usable // 8, "big") if usable else b""


class IBMHarvester:
    def __init__(self, pool: EntropyPool, token: str | None, instance: str | None, backend: str | None,
                 shots: int, interval_s: int, min_bytes: int, max_jobs_per_day: int = 2,
                 simulator: bool = False, sim_qubits: int = 127):
        self.simulator = simulator
        self.name = "ibm_simulator" if simulator else "ibm_quantum"
        self.is_quantum = not simulator
        self._sim_qubits = sim_qubits
        self.pool = pool
        self._token = token
        self._instance = instance
        self._backend_name = backend
        self._shots = shots
        self._interval = interval_s
        self._min_bytes = min_bytes
        self.monitor = HealthMonitor(RAW_MIN_ENTROPY)
        self.last_backend: str | None = None
        self.last_job_id: str | None = None
        self.last_harvest_at: float | None = None
        self.last_error: str | None = None
        self._task: asyncio.Task | None = None
        self._max_jobs = max_jobs_per_day
        self._job_times: list[float] = []

    @property
    def configured(self) -> bool:
        return self.simulator or bool(self._token)

    def start(self) -> None:
        if self.configured and self._task is None:
            self._task = asyncio.create_task(self._loop())

    async def stop(self) -> None:
        if self._task:
            self._task.cancel()
            self._task = None
        self.pool.flush()

    async def _loop(self) -> None:
        while True:
            if len(self.pool) < self._min_bytes:
                try:
                    await self.harvest_once()
                except Exception as e:  # keep the loop alive; surface the error in /entropy/status
                    self.last_error = f"{e.__class__.__name__}: {e}"[:300]
                    log.warning("IBM harvest failed: %s", self.last_error)
            await asyncio.sleep(self._interval if len(self.pool) >= self._min_bytes else 600)

    @property
    def jobs_last_24h(self) -> int:
        cutoff = time.time() - 86_400
        self._job_times = [t for t in self._job_times if t > cutoff]
        return len(self._job_times)

    async def harvest_once(self) -> int:
        if self.jobs_last_24h >= self._max_jobs:
            raise RuntimeError(f"daily QPU job cap reached ({self._max_jobs})")
        self._job_times.append(time.time())
        bitstrings, backend, job_id = await asyncio.to_thread(self._run_job)
        return await self.ingest(bitstrings, backend, job_id)

    async def ingest(self, bitstrings: list[str], backend: str, job_id: str | None) -> int:
        raw = bitstrings_to_bytes(bitstrings)
        failure = self.monitor.check(raw)
        if failure:
            self.last_error = f"health test failed: {failure}"
            return 0
        cooked = condition(raw)
        await self.pool.add(cooked, {"backend": backend, "job_id": job_id,
                                     "mode": "simulator" if self.simulator else "hardware"})
        self.last_backend, self.last_job_id = backend, job_id
        self.last_harvest_at, self.last_error = time.time(), None
        log.info("IBM harvest: %d raw -> %d conditioned bytes from %s", len(raw), len(cooked), backend)
        return len(cooked)

    def _run_job(self) -> tuple[list[str], str, str | None]:
        if self.simulator:
            from qiskit_aer import AerSimulator

            # H + measure is a Clifford circuit, so the stabilizer method simulates 100+ qubits instantly.
            return sample_backend(AerSimulator(method="stabilizer"), self._shots, self._sim_qubits)

        from qiskit_ibm_runtime import QiskitRuntimeService

        service = QiskitRuntimeService(channel="ibm_quantum_platform", token=self._token, instance=self._instance)
        backend = (service.backend(self._backend_name) if self._backend_name
                   else service.least_busy(operational=True, simulator=False))
        return sample_backend(backend, self._shots)


def sample_backend(backend, shots: int, n_qubits: int | None = None) -> tuple[list[str], str, str | None]:
    """Hadamard every qubit, measure all, return one bitstring per shot (job mode — works on the Open Plan)."""
    from qiskit import QuantumCircuit
    from qiskit.transpiler.preset_passmanagers import generate_preset_pass_manager
    from qiskit_ibm_runtime import SamplerV2

    n = n_qubits or backend.num_qubits
    qc = QuantumCircuit(n)
    qc.h(range(n))
    qc.measure_all()
    isa = generate_preset_pass_manager(backend=backend, optimization_level=1).run(qc)
    job = SamplerV2(mode=backend).run([isa], shots=shots)
    result = job.result()
    return result[0].data.meas.get_bitstrings(), backend.name, job.job_id()
