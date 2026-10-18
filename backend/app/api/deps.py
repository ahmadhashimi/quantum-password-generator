from fastapi import Request

from ..entropy import EntropyService


def get_entropy(request: Request) -> EntropyService:
    return request.app.state.entropy
