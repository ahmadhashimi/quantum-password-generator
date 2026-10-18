from typing import cast

from fastapi import Request

from ..entropy import EntropyService
from ..receipts import Keyring, Signer


def get_entropy(request: Request) -> EntropyService:
    return cast(EntropyService, request.app.state.entropy)


def get_signer(request: Request) -> Signer:
    return cast(Signer, request.app.state.signer)


def get_keyring(request: Request) -> Keyring:
    return cast(Keyring, request.app.state.keyring)
