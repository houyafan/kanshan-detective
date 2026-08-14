from __future__ import annotations

import json
import os
import shutil
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
BUNDLED_DATA_DIR = ROOT / "data"
DATA_DIR = Path(os.getenv("KANSHAN_DATA_DIR", str(BUNDLED_DATA_DIR))).expanduser()
DB_PATH = DATA_DIR / "kanshan.db"
SEED_PATH = BUNDLED_DATA_DIR / "seeds" / "case_001.json"


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def connect() -> sqlite3.Connection:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    bundled_db = BUNDLED_DATA_DIR / "kanshan.db"
    if DATA_DIR != BUNDLED_DATA_DIR and not DB_PATH.exists() and bundled_db.is_file():
        shutil.copy2(bundled_db, DB_PATH)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=DELETE")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def init_db() -> None:
    with connect() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS case_configs (
                case_id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                version INTEGER NOT NULL,
                config_json TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS player_cases (
                run_id TEXT PRIMARY KEY,
                case_id TEXT NOT NULL,
                status TEXT NOT NULL,
                last_page TEXT NOT NULL,
                state_json TEXT NOT NULL,
                fallback_used INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                run_id TEXT,
                event_name TEXT NOT NULL,
                payload_json TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS reasoning_attempts (
                attempt_id TEXT PRIMARY KEY,
                run_id TEXT NOT NULL,
                selected_option_id TEXT NOT NULL,
                evidence_json TEXT NOT NULL,
                reason TEXT NOT NULL,
                hard_result TEXT NOT NULL,
                feedback_json TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS reports (
                report_id TEXT PRIMARY KEY,
                run_id TEXT UNIQUE NOT NULL,
                grade TEXT NOT NULL,
                assisted INTEGER NOT NULL DEFAULT 0,
                report_json TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            """
        )
        seed = json.loads(SEED_PATH.read_text(encoding="utf-8"))
        conn.execute(
            """
            INSERT INTO case_configs(case_id, title, version, config_json, created_at)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(case_id) DO UPDATE SET
                title=excluded.title,
                version=excluded.version,
                config_json=excluded.config_json
            """,
            (seed["caseId"], seed["title"], seed["version"], json.dumps(seed, ensure_ascii=False), now_iso()),
        )


def get_case(case_id: str = "case_001") -> dict[str, Any]:
    with connect() as conn:
        row = conn.execute("SELECT config_json FROM case_configs WHERE case_id=?", (case_id,)).fetchone()
    if not row:
        raise KeyError(case_id)
    return json.loads(row["config_json"])


def get_run(run_id: str) -> dict[str, Any] | None:
    with connect() as conn:
        row = conn.execute("SELECT * FROM player_cases WHERE run_id=?", (run_id,)).fetchone()
    if not row:
        return None
    state = json.loads(row["state_json"])
    state.update({"runId": row["run_id"], "status": row["status"], "lastPage": row["last_page"]})
    state["fallbackUsed"] = bool(row["fallback_used"])
    state["createdAt"] = row["created_at"]
    state["updatedAt"] = row["updated_at"]
    return state


def save_run(run_id: str, state: dict[str, Any]) -> dict[str, Any]:
    updated_at = now_iso()
    state["updatedAt"] = updated_at
    with connect() as conn:
        conn.execute(
            """
            UPDATE player_cases
            SET status=?, last_page=?, state_json=?, fallback_used=?, updated_at=?
            WHERE run_id=?
            """,
            (
                state["status"],
                state["lastPage"],
                json.dumps(state, ensure_ascii=False),
                int(bool(state.get("fallbackUsed"))),
                updated_at,
                run_id,
            ),
        )
    return get_run(run_id) or state


def log_event(event_name: str, run_id: str | None = None, payload: dict[str, Any] | None = None) -> None:
    with connect() as conn:
        conn.execute(
            "INSERT INTO events(run_id, event_name, payload_json, created_at) VALUES (?, ?, ?, ?)",
            (run_id, event_name, json.dumps(payload or {}, ensure_ascii=False), now_iso()),
        )
