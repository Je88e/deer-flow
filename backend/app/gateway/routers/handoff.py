import asyncio
import secrets
import time
from dataclasses import dataclass
from datetime import UTC, datetime

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from app.gateway.deps import get_run_manager


@dataclass(frozen=True)
class _HandoffRecord:
    thread_id: str
    run_id: str
    expires_at_epoch_s: float


_handoff_lock = asyncio.Lock()
_handoff_records: dict[str, _HandoffRecord] = {}

router = APIRouter(prefix="/api/handoff", tags=["handoff"])


class CreateHandoffRequest(BaseModel):
    thread_id: str = Field(min_length=1)
    run_id: str = Field(min_length=1)
    ttl_seconds: int = Field(default=300, ge=15, le=3600)


class CreateHandoffResponse(BaseModel):
    token: str
    expires_at: str


class RedeemHandoffRequest(BaseModel):
    token: str = Field(min_length=1)


class RedeemHandoffResponse(BaseModel):
    thread_id: str
    run_id: str
    expires_at: str


def _iso_utc(epoch_s: float) -> str:
    return datetime.fromtimestamp(epoch_s, tz=UTC).isoformat()


def _prune_handoff(now_s: float) -> None:
    expired = [k for k, v in _handoff_records.items() if v.expires_at_epoch_s <= now_s]
    for k in expired:
        _handoff_records.pop(k, None)


@router.post("", response_model=CreateHandoffResponse)
async def create_handoff(body: CreateHandoffRequest, request: Request) -> JSONResponse:
    run_mgr = get_run_manager(request)
    record = run_mgr.get(body.run_id)
    if record is None or record.thread_id != body.thread_id:
        raise HTTPException(status_code=404, detail="Run not found")

    now_s = time.time()
    expires_at = now_s + float(body.ttl_seconds)
    token = secrets.token_urlsafe(32)

    async with _handoff_lock:
        _prune_handoff(now_s)
        _handoff_records[token] = _HandoffRecord(
            thread_id=body.thread_id,
            run_id=body.run_id,
            expires_at_epoch_s=expires_at,
        )

    return JSONResponse(
        content=CreateHandoffResponse(token=token, expires_at=_iso_utc(expires_at)).model_dump(),
        headers={"Cache-Control": "no-store"},
    )


@router.post("/redeem", response_model=RedeemHandoffResponse)
async def redeem_handoff(body: RedeemHandoffRequest) -> JSONResponse:
    now_s = time.time()
    async with _handoff_lock:
        _prune_handoff(now_s)
        record = _handoff_records.pop(body.token, None)

    if record is None:
        raise HTTPException(status_code=404, detail="Handoff not found")
    if record.expires_at_epoch_s <= now_s:
        raise HTTPException(status_code=410, detail="Handoff expired")

    return JSONResponse(
        content=RedeemHandoffResponse(
            thread_id=record.thread_id,
            run_id=record.run_id,
            expires_at=_iso_utc(record.expires_at_epoch_s),
        ).model_dump(),
        headers={"Cache-Control": "no-store"},
    )
