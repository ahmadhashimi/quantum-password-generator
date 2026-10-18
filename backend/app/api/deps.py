from fastapi import Request

from ..entropy import EntropyService


def get_entropy(request: Request) -> EntropyService:
    return request.app.state.entropy


def get_signer(request: Request):
    return request.app.state.signer


def get_keyring(request: Request):
    return request.app.state.keyring
