"""Real-network checks. Run with:  pytest -m live   (set ANU_API_KEY for ANU)."""

import os

import httpx
import pytest

from app.config import get_settings
from app.entropy.anu import ANUProvider
from app.entropy.health import HealthMonitor
from app.entropy.lfd import LfDProvider

pytestmark = pytest.mark.live


@pytest.fixture
async def client():
    async with httpx.AsyncClient() as c:
        yield c


async def test_lfd_live(client):
    data = await LfDProvider(client, get_settings().lfd_api_url, 10).fetch(1024)
    assert len(data) == 1024 and HealthMonitor(7.0).check(data) is None


@pytest.mark.skipif(not os.getenv("ANU_API_KEY"), reason="ANU_API_KEY not set")
async def test_anu_live(client):
    s = get_settings()
    data = await ANUProvider(client, os.environ["ANU_API_KEY"], s.anu_api_url, 10).fetch(1024)
    assert len(data) == 1024 and HealthMonitor(7.0).check(data) is None
