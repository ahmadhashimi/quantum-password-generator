import os


class LocalCSPRNGProvider:
    """OS CSPRNG. Always available; never labelled quantum."""

    name = "os_csprng"
    is_quantum = False
    configured = True

    async def fetch(self, n: int) -> bytes:
        return os.urandom(n)
