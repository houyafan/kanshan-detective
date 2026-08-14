from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from .cli_adapter import search_zhihu
from .db import connect, get_case, get_run, init_db, log_event, now_iso, save_run


ROOT = Path(__file__).resolve().parents[1]
app = FastAPI(title="看山侦探事务所 API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class SearchRequest(BaseModel):
    query: str = Field(min_length=2, max_length=40)
    mode: str = "auto"


class TaskCompleteRequest(BaseModel):
    payload: dict[str, Any] = Field(default_factory=dict)


class ReasoningRequest(BaseModel):
    attemptId: str
    selectedOptionId: str
    evidenceIds: list[str] = Field(min_length=2, max_length=3)
    reason: str = Field(default="", max_length=120)


class RunPatchRequest(BaseModel):
    lastPage: str | None = None
    draftReasoning: dict[str, Any] | None = None
    noteDraft: str | None = None


class EventRequest(BaseModel):
    runId: str | None = None
    eventName: str
    payload: dict[str, Any] = Field(default_factory=dict)


TASK_REWARDS = {
    "T01": (["E01"], ["P1"]),
    "T02": (["E02"], ["P2"]),
    "T03": (["E03"], ["P3"]),
    "T04": (["E04"], ["P4", "P5"]),
    "T05": (["E05"], ["P6", "P7"]),
}


@app.on_event("startup")
def startup() -> None:
    init_db()


def require_run(run_id: str) -> dict[str, Any]:
    state = get_run(run_id)
    if not state:
        raise HTTPException(status_code=404, detail="RUN_NOT_FOUND")
    return state


def add_unique(target: list[str], values: list[str]) -> None:
    for value in values:
        if value not in target:
            target.append(value)


def unlock_tasks(state: dict[str, Any]) -> None:
    tasks = state["taskStates"]
    evidence = set(state["evidenceIds"])
    if tasks["T01"] == "COMPLETED":
        for task_id in ("T02", "T04"):
            if tasks[task_id] == "LOCKED":
                tasks[task_id] = "AVAILABLE"
    if {"E01", "E02"}.issubset(evidence) and tasks["T03"] == "LOCKED":
        tasks["T03"] = "AVAILABLE"
    if len(evidence) >= 3 and tasks["T05"] == "LOCKED":
        tasks["T05"] = "AVAILABLE"
    if "E05" in evidence:
        state["status"] = "READY"


def evidence_detail(case: dict[str, Any], state: dict[str, Any], evidence_id: str) -> dict[str, Any]:
    override = state.get("evidenceDetails", {}).get(evidence_id)
    if override:
        base = next(item for item in case["evidence"] if item["id"] == evidence_id)
        return {**base, **override}
    return next(item for item in case["evidence"] if item["id"] == evidence_id)


def build_report(state: dict[str, Any], selected_option_id: str, evidence_ids: list[str], assisted: bool) -> dict[str, Any]:
    case = get_case(state["caseId"])
    attempt_count = state["attemptCount"]
    grade = "B" if assisted or attempt_count >= 3 else ("S" if attempt_count == 1 and len(state["evidenceIds"]) >= 4 else "A")
    option = next(item for item in case["reasoning"]["options"] if item["id"] == selected_option_id)
    evidence_chain = [evidence_detail(case, state, evidence_id) for evidence_id in evidence_ids]
    sources = []
    for evidence_id in state["evidenceIds"]:
        item = evidence_detail(case, state, evidence_id)
        if item.get("sourceUrl"):
            sources.append({"title": item["title"], "url": item["sourceUrl"], "source": item.get("source", "演示内容")})
    duration_seconds = max(60, int((datetime.now(timezone.utc) - datetime.fromisoformat(state["startedAt"])).total_seconds()))
    report = {
        "reportId": f"report_{uuid.uuid4().hex[:10]}",
        "runId": state["runId"],
        "grade": grade,
        "assisted": assisted,
        "attemptCount": attempt_count,
        "durationSeconds": duration_seconds,
        "selectedOption": option,
        "evidenceChain": evidence_chain,
        "conclusion": case["report"]["conclusion"],
        "limitation": case["report"]["limitation"],
        "comment": case["report"]["assistedComment" if assisted else "successComment"],
        "sources": sources,
        "fallbackUsed": bool(state.get("fallbackUsed")),
        "shareDraft": case["report"]["shareTemplate"].format(grade=grade),
        "createdAt": now_iso(),
    }
    with connect() as conn:
        conn.execute(
            """
            INSERT OR REPLACE INTO reports(report_id, run_id, grade, assisted, report_json, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (report["reportId"], state["runId"], grade, int(assisted), json.dumps(report, ensure_ascii=False), now_iso()),
        )
    state["status"] = "CLOSED"
    state["lastPage"] = "P07"
    state["report"] = report
    add_unique(state["pieceIds"], ["P9"])
    return report


@app.get("/api/health")
def health() -> dict[str, Any]:
    cli_path = Path.home() / "Library" / "Application Support" / "zhihu-cli" / "current" / "zhihu-cli"
    return {"ok": True, "sqlite": str(ROOT / "data" / "kanshan.db"), "cliAvailable": cli_path.is_file()}


@app.get("/api/case/current")
def current_case() -> dict[str, Any]:
    return get_case()


@app.post("/api/runs")
def create_run() -> dict[str, Any]:
    run_id = f"run_{uuid.uuid4().hex[:12]}"
    created_at = now_iso()
    state = {
        "runId": run_id,
        "caseId": "case_001",
        "status": "BRIEF",
        "lastPage": "P02",
        "taskStates": {"T01": "AVAILABLE", "T02": "LOCKED", "T03": "LOCKED", "T04": "LOCKED", "T05": "LOCKED"},
        "evidenceIds": [],
        "evidenceDetails": {},
        "pieceIds": [],
        "hintRemaining": 1,
        "attemptCount": 0,
        "draftReasoning": None,
        "noteDraft": "",
        "fallbackUsed": False,
        "version": 1,
        "createdAt": created_at,
        "updatedAt": created_at,
    }
    with connect() as conn:
        conn.execute(
            """
            INSERT INTO player_cases(run_id, case_id, status, last_page, state_json, fallback_used, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, 0, ?, ?)
            """,
            (run_id, "case_001", "BRIEF", "P02", json.dumps(state, ensure_ascii=False), created_at, created_at),
        )
    log_event("case_accept", run_id, {"caseId": "case_001"})
    return require_run(run_id)


@app.get("/api/runs/{run_id}")
def read_run(run_id: str) -> dict[str, Any]:
    return require_run(run_id)


@app.patch("/api/runs/{run_id}")
def patch_run(run_id: str, body: RunPatchRequest) -> dict[str, Any]:
    state = require_run(run_id)
    updates = body.model_dump(exclude_unset=True)
    if "lastPage" in updates and updates["lastPage"]:
        state["lastPage"] = updates["lastPage"]
    if "draftReasoning" in updates:
        state["draftReasoning"] = updates["draftReasoning"]
    if "noteDraft" in updates:
        state["noteDraft"] = updates["noteDraft"]
    return save_run(run_id, state)


@app.post("/api/runs/{run_id}/start")
def start_run(run_id: str) -> dict[str, Any]:
    state = require_run(run_id)
    if state["status"] == "BRIEF":
        state["status"] = "INVESTIGATING"
        state["startedAt"] = now_iso()
        state["lastPage"] = "P03"
        log_event("brief_start", run_id)
    return save_run(run_id, state)


@app.post("/api/runs/{run_id}/search")
def search(run_id: str, body: SearchRequest) -> dict[str, Any]:
    state = require_run(run_id)
    result = search_zhihu(body.query.strip(), force_demo=body.mode == "demo")
    if result["fallbackUsed"]:
        state["fallbackUsed"] = True
        save_run(run_id, state)
    log_event(
        "search_submit",
        run_id,
        {"queryLength": len(body.query.strip()), "resultCount": len(result["results"]), "fallbackUsed": result["fallbackUsed"]},
    )
    return result


@app.post("/api/runs/{run_id}/tasks/{task_id}/complete")
def complete_task(run_id: str, task_id: str, body: TaskCompleteRequest) -> dict[str, Any]:
    state = require_run(run_id)
    task_id = task_id.upper()
    if task_id not in TASK_REWARDS:
        raise HTTPException(status_code=404, detail="TASK_NOT_FOUND")
    task_state = state["taskStates"][task_id]
    if task_state == "LOCKED":
        raise HTTPException(status_code=409, detail="TASK_LOCKED")
    if task_state == "COMPLETED":
        return state

    payload = body.payload
    if task_id == "T01":
        source = payload.get("source")
        if not source or not source.get("sourceId"):
            raise HTTPException(status_code=422, detail="SOURCE_REQUIRED")
        state["evidenceDetails"]["E01"] = {
            "excerpt": source.get("summary", "")[:180],
            "source": source.get("author") or "知乎用户",
            "sourceUrl": source.get("url"),
            "fallback": bool(source.get("fallback")),
        }
    elif task_id == "T02" and not payload.get("excerptId"):
        raise HTTPException(status_code=422, detail="EXCERPT_REQUIRED")
    elif task_id == "T03" and (not payload.get("viewpoint") or not payload.get("reasonTag")):
        raise HTTPException(status_code=422, detail="COMPARISON_REQUIRED")
    elif task_id == "T04":
        note = str(payload.get("note", "")).strip()
        if not 10 <= len(note) <= 120:
            raise HTTPException(status_code=422, detail="NOTE_LENGTH")
        state["noteDraft"] = note
        state["evidenceDetails"]["E04"] = {"excerpt": note[:80]}
    elif task_id == "T05" and not (payload.get("supportChecked") and payload.get("limitationChecked")):
        raise HTTPException(status_code=422, detail="SOURCE_CONFIRMATION_REQUIRED")

    evidence_ids, piece_ids = TASK_REWARDS[task_id]
    add_unique(state["evidenceIds"], evidence_ids)
    add_unique(state["pieceIds"], piece_ids)
    state["taskStates"][task_id] = "COMPLETED"
    state.setdefault("taskPayloads", {})[task_id] = payload
    unlock_tasks(state)
    state["lastPage"] = "P03"
    log_event("task_complete", run_id, {"taskId": task_id, "evidenceIds": evidence_ids, "pieceIds": piece_ids})
    return save_run(run_id, state)


@app.post("/api/runs/{run_id}/reasoning")
def submit_reasoning(run_id: str, body: ReasoningRequest) -> dict[str, Any]:
    state = require_run(run_id)
    if state["status"] not in {"READY", "REASONING"}:
        raise HTTPException(status_code=409, detail="CASE_NOT_READY")
    with connect() as conn:
        existing = conn.execute("SELECT feedback_json FROM reasoning_attempts WHERE attempt_id=?", (body.attemptId,)).fetchone()
    if existing:
        return {"state": state, **json.loads(existing["feedback_json"])}

    state["status"] = "REASONING"
    state["attemptCount"] += 1
    correct_option = body.selectedOptionId == "O2"
    has_required = "E05" in body.evidenceIds
    has_support = any(item in body.evidenceIds for item in ("E02", "E03"))
    success = correct_option and has_required and has_support
    if success:
        feedback = "证据链闭合：你的结论同时包含关键来源与一条相互印证的证词。"
    elif not correct_option:
        feedback = "结论跑在证据前面了。回看能够同时解释“睡够”和“仍疲惫”的方向。"
    elif not has_required:
        feedback = "方向接近，但缺少决定性证据。把“关键来源与限制”放进证据链。"
    else:
        feedback = "关键来源已经在场，还需要一条能够支持该方向的专家或矛盾分析证据。"

    result = {"success": success, "feedback": feedback, "attemptCount": state["attemptCount"]}
    with connect() as conn:
        conn.execute(
            """
            INSERT INTO reasoning_attempts(attempt_id, run_id, selected_option_id, evidence_json, reason, hard_result, feedback_json, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                body.attemptId,
                run_id,
                body.selectedOptionId,
                json.dumps(body.evidenceIds, ensure_ascii=False),
                body.reason,
                "success" if success else "fail",
                json.dumps(result, ensure_ascii=False),
                now_iso(),
            ),
        )
    state["draftReasoning"] = body.model_dump()
    if success:
        result["report"] = build_report(state, body.selectedOptionId, body.evidenceIds, assisted=False)
        log_event("case_close", run_id, {"grade": result["report"]["grade"], "assisted": False})
    else:
        state["lastPage"] = "P06"
    result["state"] = save_run(run_id, state)
    log_event("reasoning_result", run_id, {"success": success, "attemptCount": state["attemptCount"]})
    return result


@app.post("/api/runs/{run_id}/assist")
def assist_close(run_id: str) -> dict[str, Any]:
    state = require_run(run_id)
    if state["attemptCount"] < 3:
        raise HTTPException(status_code=409, detail="ASSIST_NOT_AVAILABLE")
    evidence_ids = [item for item in ("E05", "E02", "E03") if item in state["evidenceIds"]][:3]
    report = build_report(state, "O2", evidence_ids, assisted=True)
    saved = save_run(run_id, state)
    log_event("case_close", run_id, {"grade": "B", "assisted": True})
    return {"state": saved, "report": report}


@app.get("/api/runs/{run_id}/report")
def get_report(run_id: str) -> dict[str, Any]:
    state = require_run(run_id)
    if state["status"] != "CLOSED":
        raise HTTPException(status_code=409, detail="CASE_NOT_CLOSED")
    if state.get("report"):
        return state["report"]
    with connect() as conn:
        row = conn.execute("SELECT report_json FROM reports WHERE run_id=?", (run_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="REPORT_NOT_FOUND")
    return json.loads(row["report_json"])


@app.post("/api/events")
def event(body: EventRequest) -> dict[str, bool]:
    log_event(body.eventName, body.runId, body.payload)
    return {"ok": True}


DIST_DIR = ROOT / "dist"
if DIST_DIR.is_dir():
    app.mount("/assets", StaticFiles(directory=DIST_DIR / "assets"), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    def spa(full_path: str) -> FileResponse:
        candidate = DIST_DIR / full_path
        if candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(DIST_DIR / "index.html")
