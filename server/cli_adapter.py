from __future__ import annotations

import json
import os
import re
import subprocess
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
FALLBACK_PATH = ROOT / "data" / "seeds" / "demo_search_results.json"
DEFAULT_CLI = Path.home() / "Library" / "Application Support" / "zhihu-cli" / "current" / "zhihu-cli"


def _clean_answer_text(answer: str) -> str:
    preface = re.compile(
        r"^\s*(?:\*\*)?根据你的要求[，,]\s*以下三句简短中文[:：](?:\*\*)?\s*",
        re.MULTILINE,
    )
    return preface.sub("", answer, count=1).strip()


def _answer_is_safe(answer: str, query: str) -> bool:
    forbidden = (
        "真凶就是",
        "已经确诊",
        "可以确诊",
        "建议服用",
        "治疗方案",
        "处方",
        "剂量",
    )
    if not answer or len(answer) > 900 or any(term in answer for term in forbidden):
        return False

    # Direct Answer may reframe reviewed facts, but it must not invent a new
    # time, duration, evidence number, or other numeric case detail.
    allowed_numbers = set(re.findall(r"\d+(?::\d+)?", query))
    answer_numbers = set(re.findall(r"\d+(?::\d+)?", answer))
    return answer_numbers.issubset(allowed_numbers)


def configured_cli_path() -> Path:
    return Path(os.getenv("ZHIHU_CLI_PATH", str(DEFAULT_CLI)))


def cli_runtime_status() -> dict[str, Any]:
    cli_path = configured_cli_path()
    available = cli_path.is_file() and os.access(cli_path, os.X_OK)
    return {
        "path": str(cli_path),
        "available": available,
        "accessSecretEnvConfigured": bool(os.getenv("ZHIHU_ACCESS_SECRET", "").strip()),
    }


def _normalize_item(item: dict[str, Any], fallback: bool = False) -> dict[str, Any]:
    content = str(item.get("ContentText") or item.get("summary") or "").replace("\n", " ").strip()
    return {
        "sourceId": str(item.get("ContentID") or item.get("sourceId") or "unknown"),
        "title": str(item.get("Title") or item.get("title") or "未命名内容"),
        "author": str(item.get("AuthorName") or item.get("author") or "知乎用户"),
        "summary": content[:220],
        "url": str(item.get("Url") or item.get("url") or "https://www.zhihu.com/"),
        "type": str(item.get("ContentType") or item.get("type") or "Content"),
        "fallback": fallback,
    }


def fallback_results() -> list[dict[str, Any]]:
    raw = json.loads(FALLBACK_PATH.read_text(encoding="utf-8"))
    return [_normalize_item(item, True) for item in raw["results"]]


def search_zhihu(query: str, force_demo: bool = False) -> dict[str, Any]:
    if force_demo:
        return {"results": fallback_results(), "fallbackUsed": True, "source": "demo"}

    cli_path = configured_cli_path()
    if not cli_path.is_file() or not os.access(cli_path, os.X_OK):
        return {"results": fallback_results(), "fallbackUsed": True, "source": "demo", "error": "CLI_NOT_FOUND"}

    command = [str(cli_path), "search", "zhihu", "--query", query, "--count", "6", "--timeout", "10s"]
    try:
        result = subprocess.run(command, capture_output=True, text=True, timeout=12, check=False)
        if result.returncode != 0:
            raise RuntimeError(result.stderr.strip() or "CLI_FAILED")
        payload = json.loads(result.stdout)
        if payload.get("Code") != 0:
            raise RuntimeError(payload.get("Message") or "CLI_ERROR")
        items = payload.get("Data", {}).get("Items", [])
        normalized = [_normalize_item(item) for item in items if item.get("Title") and item.get("Url")]
        if not normalized:
            return {"results": [], "fallbackUsed": False, "source": "zhihu-cli"}
        return {"results": normalized, "fallbackUsed": False, "source": "zhihu-cli"}
    except (subprocess.TimeoutExpired, json.JSONDecodeError, OSError, RuntimeError) as exc:
        return {
            "results": fallback_results(),
            "fallbackUsed": True,
            "source": "demo",
            "error": exc.__class__.__name__,
        }


def answer_zhihu(query: str, fallback_text: str, timeout_seconds: int = 8) -> dict[str, Any]:
    cli_path = configured_cli_path()
    if not cli_path.is_file() or not os.access(cli_path, os.X_OK):
        return {"answer": fallback_text, "fallbackUsed": True, "source": "template", "error": "CLI_NOT_FOUND"}

    command = [
        str(cli_path),
        "answer",
        "--query",
        query,
        "--model",
        "zhida-fast-1p5",
        "--output",
        "json",
        "--timeout",
        f"{timeout_seconds}s",
    ]
    try:
        result = subprocess.run(
            command,
            capture_output=True,
            text=True,
            timeout=timeout_seconds + 1,
            check=False,
        )
        if result.returncode != 0:
            raise RuntimeError(result.stderr.strip() or "CLI_FAILED")
        payload = json.loads(result.stdout)
        answer = _clean_answer_text(str(payload["choices"][0]["message"]["content"]))
        if not _answer_is_safe(answer, query):
            raise RuntimeError("ANSWER_REJECTED")
        return {
            "answer": answer[:900],
            "fallbackUsed": False,
            "source": "zhihu-answer",
            "model": str(payload.get("model") or "zhida-fast-1p5"),
        }
    except (subprocess.TimeoutExpired, json.JSONDecodeError, KeyError, IndexError, OSError, RuntimeError) as exc:
        return {
            "answer": fallback_text,
            "fallbackUsed": True,
            "source": "template",
            "model": "template",
            "error": exc.__class__.__name__,
        }
