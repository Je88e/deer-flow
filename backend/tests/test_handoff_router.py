import anyio
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.gateway.routers import handoff
from deerflow.runtime import RunManager


@pytest.fixture
def app() -> FastAPI:
    app = FastAPI()
    app.state.run_manager = RunManager()
    app.include_router(handoff.router)
    return app


def test_create_and_redeem_handoff(app: FastAPI):
    record = anyio.run(app.state.run_manager.create, "thread-1")

    with TestClient(app) as client:
        created = client.post(
            "/api/handoff",
            json={"thread_id": "thread-1", "run_id": record.run_id, "ttl_seconds": 60},
        )
        assert created.status_code == 200
        token = created.json()["token"]
        assert isinstance(token, str)
        assert token

        redeemed = client.post("/api/handoff/redeem", json={"token": token})
        assert redeemed.status_code == 200
        assert redeemed.json()["thread_id"] == "thread-1"
        assert redeemed.json()["run_id"] == record.run_id

        redeemed_again = client.post("/api/handoff/redeem", json={"token": token})
        assert redeemed_again.status_code == 404


def test_create_handoff_rejects_mismatched_thread(app: FastAPI):
    record = anyio.run(app.state.run_manager.create, "thread-1")

    with TestClient(app) as client:
        response = client.post(
            "/api/handoff",
            json={"thread_id": "thread-2", "run_id": record.run_id, "ttl_seconds": 60},
        )
    assert response.status_code == 404


def test_redeem_handoff_expired(app: FastAPI, monkeypatch: pytest.MonkeyPatch):
    record = anyio.run(app.state.run_manager.create, "thread-1")

    monkeypatch.setattr("app.gateway.routers.handoff.time.time", lambda: 1000.0)
    with TestClient(app) as client:
        created = client.post(
            "/api/handoff",
            json={"thread_id": "thread-1", "run_id": record.run_id, "ttl_seconds": 15},
        )
        token = created.json()["token"]

        monkeypatch.setattr("app.gateway.routers.handoff.time.time", lambda: 2000.0)
        redeemed = client.post("/api/handoff/redeem", json={"token": token})
        assert redeemed.status_code == 404
