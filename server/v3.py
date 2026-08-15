from __future__ import annotations

import json
import uuid
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from .cli_adapter import answer_zhihu, search_zhihu
from .db import connect, get_case, get_run, log_event, now_iso, save_run


router = APIRouter(prefix="/api/v3", tags=["v3"])


class SearchBody(BaseModel):
    query: str = Field(min_length=2, max_length=40)
    mode: str = "auto"


class CompleteRoundBody(BaseModel):
    actionId: str
    payload: dict[str, Any] = Field(default_factory=dict)


class VoteBody(BaseModel):
    voteId: str
    suspectId: str
    role: str = "主要原因"
    confidence: str = "中"
    reasonEvidenceId: str | None = None


class AssistantBody(BaseModel):
    turnId: str
    question: str = Field(min_length=2, max_length=120)


class FinalBody(BaseModel):
    decisionId: str
    culpritId: str
    accompliceId: str | None = None
    evidenceIds: list[str] = Field(min_length=2, max_length=2)
    redHerringId: str
    reason: str = Field(min_length=20, max_length=180)


def case_config() -> dict[str, Any]:
    return get_case("case_001_v3")


def public_case() -> dict[str, Any]:
    case = dict(case_config())
    case.pop("truth", None)
    return case


def require_v3_run(run_id: str) -> dict[str, Any]:
    state = get_run(run_id)
    if not state:
        raise HTTPException(status_code=404, detail="RUN_NOT_FOUND")
    if state.get("caseVersion") != 3:
        raise HTTPException(status_code=409, detail="RUN_VERSION_MISMATCH")
    return state


def round_config(round_id: str) -> dict[str, Any]:
    try:
        return next(item for item in case_config()["rounds"] if item["id"] == round_id)
    except StopIteration as exc:
        raise HTTPException(status_code=404, detail="ROUND_NOT_FOUND") from exc


def current_round_id(state: dict[str, Any]) -> str:
    return f"R{state['currentRound']}"


def ensure_current_round(state: dict[str, Any], round_id: str, allowed_statuses: set[str]) -> None:
    if current_round_id(state) != round_id or state["status"] not in allowed_statuses:
        raise HTTPException(status_code=409, detail="ROUND_NOT_ACTIVE")


def suspect_name(suspect_id: str | None) -> str:
    if not suspect_id:
        return "无"
    suspect = next((item for item in case_config()["suspects"] if item["id"] == suspect_id), None)
    if not suspect:
        raise HTTPException(status_code=422, detail="INVALID_SUSPECT")
    return suspect["name"]


def evidence_by_id(state: dict[str, Any], evidence_id: str) -> dict[str, Any] | None:
    return next((item for item in state["evidenceRecords"] if item["id"] == evidence_id), None)


@router.get("/case/current")
def get_current_case() -> dict[str, Any]:
    return public_case()


@router.post("/runs")
def create_run() -> dict[str, Any]:
    run_id = f"v3_{uuid.uuid4().hex[:12]}"
    created_at = now_iso()
    state = {
        "runId": run_id,
        "caseId": "case_001_v3",
        "caseVersion": 3,
        "status": "BRIEF",
        "lastPage": "/brief",
        "currentRound": 0,
        "roundStates": {
            f"R{index}": {"status": "LOCKED", "payload": {}, "evidenceIds": []}
            for index in range(1, 8)
        },
        "votes": [],
        "evidenceRecords": [],
        "assistantTurns": [],
        "recaps": {},
        "fallbackUsed": False,
        "report": None,
        "createdAt": created_at,
        "updatedAt": created_at,
    }
    with connect() as conn:
        conn.execute(
            """
            INSERT INTO player_cases(run_id, case_id, status, last_page, state_json, fallback_used, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, 0, ?, ?)
            """,
            (run_id, state["caseId"], state["status"], state["lastPage"], json.dumps(state, ensure_ascii=False), created_at, created_at),
        )
    log_event("v3_case_accept", run_id, {"caseVersion": 3})
    return require_v3_run(run_id)


@router.get("/runs/{run_id}")
def read_run(run_id: str) -> dict[str, Any]:
    return require_v3_run(run_id)


@router.post("/runs/{run_id}/brief/confirm")
def confirm_brief(run_id: str) -> dict[str, Any]:
    state = require_v3_run(run_id)
    if state["status"] == "BRIEF":
        state["status"] = "INITIAL_VOTE"
        state["lastPage"] = "/initial-vote"
        state["startedAt"] = now_iso()
        log_event("v3_brief_confirm", run_id)
    return save_run(run_id, state)


@router.post("/runs/{run_id}/votes/initial")
def submit_initial_vote(run_id: str, body: VoteBody) -> dict[str, Any]:
    state = require_v3_run(run_id)
    if state["status"] != "INITIAL_VOTE":
        if any(item["roundId"] == "R0" for item in state["votes"]):
            return state
        raise HTTPException(status_code=409, detail="INVALID_STATE")
    suspect_name(body.suspectId)
    vote = {
        "voteId": body.voteId,
        "roundId": "R0",
        "suspectId": body.suspectId,
        "role": "初始判断",
        "confidence": body.confidence,
        "reasonEvidenceId": None,
        "createdAt": now_iso(),
    }
    with connect() as conn:
        conn.execute(
            """INSERT OR IGNORE INTO v3_votes
            (vote_id, run_id, round_id, suspect_id, role, confidence, reason_evidence_id, created_at)
            VALUES (?, ?, 'R0', ?, ?, ?, NULL, ?)""",
            (body.voteId, run_id, body.suspectId, vote["role"], body.confidence, vote["createdAt"]),
        )
    state["votes"].append(vote)
    state["currentRound"] = 1
    state["roundStates"]["R1"]["status"] = "ACTIVE"
    state["status"] = "ROUND_ACTIVE"
    state["lastPage"] = "/round/R1"
    log_event("v3_initial_vote", run_id, {"suspectId": body.suspectId, "confidence": body.confidence})
    return save_run(run_id, state)


@router.post("/runs/{run_id}/rounds/{round_id}/search")
def search_round(run_id: str, round_id: str, body: SearchBody) -> dict[str, Any]:
    state = require_v3_run(run_id)
    ensure_current_round(state, round_id, {"ROUND_ACTIVE"})
    config = round_config(round_id)
    if config["mode"] not in {"search", "targeted_search"}:
        raise HTTPException(status_code=409, detail="SEARCH_NOT_ALLOWED")
    result = search_zhihu(body.query.strip(), force_demo=body.mode == "demo")
    if result["fallbackUsed"]:
        state["fallbackUsed"] = True
    state["roundStates"][round_id]["searchQuery"] = body.query.strip()
    state["roundStates"][round_id]["searchResults"] = result["results"][:6]
    save_run(run_id, state)
    log_event("v3_search_submit", run_id, {"roundId": round_id, "resultCount": len(result["results"]), "fallback": result["fallbackUsed"]})
    return result


@router.post("/runs/{run_id}/assistant/turns")
def assistant_turn(run_id: str, body: AssistantBody) -> dict[str, Any]:
    state = require_v3_run(run_id)
    ensure_current_round(state, "R5", {"ROUND_ACTIVE"})
    existing = next((item for item in state["assistantTurns"] if item["turnId"] == body.turnId), None)
    if existing:
        return existing
    same_question = next((item for item in state["assistantTurns"] if item["question"] == body.question.strip()), None)
    if same_question:
        return same_question
    if len(state["assistantTurns"]) >= 4:
        raise HTTPException(status_code=409, detail="ASSISTANT_TURNS_COMPLETE")

    config = round_config("R5")
    guided_prompt = next(
        (item for item in config.get("assistantPrompts", []) if item["question"] == body.question.strip()),
        None,
    )
    if guided_prompt:
        point_text = "\n".join(f"{item['label']}：{item['text']}" for item in guided_prompt["points"])
        result = {
            "answer": f"{guided_prompt['intro']}\n{point_text}\n观察提示：{guided_prompt['observation']}",
            "fallbackUsed": False,
            "source": "prebuilt-case-guidance",
            "model": "prebuilt-case-guidance",
        }
    else:
        evidence_summary = "；".join(f"{item['id']} {item['title']}：{item.get('excerpt', '')}" for item in state["evidenceRecords"][-8:])
        prompt = (
            "你是看山侦探事务所的协查助手。只讨论固定案件《失踪的45分钟》，不能裁定真凶，不能诊断或给治疗建议。"
            "请比较已有证据、指出至少一个仍未解释的缺口，并用一个问题让玩家继续核查。"
            f"已有证据：{evidence_summary}。玩家问题：{body.question.strip()}"
        )
        result = answer_zhihu(prompt, config["fallbackAnswer"], timeout_seconds=8)
    turn = {
        "turnId": body.turnId,
        "question": body.question.strip(),
        "answer": result["answer"],
        "fallbackUsed": result["fallbackUsed"],
        "source": result["source"],
        "citationIds": ["S_DOCTOR", "S_RESEARCH"],
        "createdAt": now_iso(),
    }
    with connect() as conn:
        conn.execute(
            """INSERT INTO v3_assistant_turns
            (turn_id, run_id, round_id, question, answer, fallback, model, created_at)
            VALUES (?, ?, 'R5', ?, ?, ?, ?, ?)""",
            (body.turnId, run_id, turn["question"], turn["answer"], int(turn["fallbackUsed"]), result.get("model", "template"), turn["createdAt"]),
        )
    state["assistantTurns"].append(turn)
    if result["fallbackUsed"]:
        state["fallbackUsed"] = True
    save_run(run_id, state)
    log_event("v3_assistant_turn", run_id, {"turnIndex": len(state["assistantTurns"]), "fallback": result["fallbackUsed"]})
    return turn


@router.post("/runs/{run_id}/rounds/{round_id}/complete")
def complete_round(run_id: str, round_id: str, body: CompleteRoundBody) -> dict[str, Any]:
    state = require_v3_run(run_id)
    ensure_current_round(state, round_id, {"ROUND_ACTIVE"})
    progress = state["roundStates"][round_id]
    if progress["status"] == "READY_TO_VOTE":
        return state
    config = round_config(round_id)
    if round_id == "R5" and len(state["assistantTurns"]) < 1:
        raise HTTPException(status_code=422, detail="ASSISTANT_VIEW_REQUIRED")
    if round_id == "R6" and body.payload.get("comparisonAnswer") != "weaken-phone":
        raise HTTPException(status_code=422, detail="COMPARISON_JUDGEMENT_REQUIRED")
    if round_id == "R7":
        review_evidence = body.payload.get("evidence", {})
        support_source = review_evidence.get("E12", {}).get("sourceId") if isinstance(review_evidence, dict) else None
        challenge_source = review_evidence.get("E13", {}).get("sourceId") if isinstance(review_evidence, dict) else None
        if not body.payload.get("reviewCondition") or not support_source or not challenge_source or support_source == challenge_source:
            raise HTTPException(status_code=422, detail="REVERSE_CHECK_REQUIRED")

    overrides = body.payload.get("evidence", {})
    blueprints = {item["id"]: item for item in case_config()["evidenceBlueprints"]}
    created_ids = []
    for evidence_id in config["evidenceRewards"]:
        if evidence_by_id(state, evidence_id):
            created_ids.append(evidence_id)
            continue
        blueprint = dict(blueprints[evidence_id])
        override = overrides.get(evidence_id, {}) if isinstance(overrides, dict) else {}
        record = {
            **blueprint,
            "excerpt": str(override.get("excerpt") or blueprint.get("excerpt") or "审核摘录已收录。")[:220],
            "relation": str(override.get("relation") or blueprint.get("defaultRelation") or "补充"),
            "sourceId": override.get("sourceId"),
            "sourceTitle": override.get("sourceTitle"),
            "sourceUrl": override.get("sourceUrl"),
            "suspectIds": override.get("suspectIds") or blueprint.get("suspectIds", []),
            "limitations": str(override.get("limitations") or "该证据只能用于本案推理，不能单独证明个体医学因果。"),
            "createdAt": now_iso(),
        }
        state["evidenceRecords"].append(record)
        created_ids.append(evidence_id)

    progress["status"] = "READY_TO_VOTE"
    progress["payload"] = body.payload
    progress["evidenceIds"] = created_ids
    progress["actionId"] = body.actionId
    state["status"] = "ROUND_VOTE"
    state["lastPage"] = f"/round/{round_id}/vote"
    log_event("v3_round_complete", run_id, {"roundId": round_id, "evidenceIds": created_ids})
    return save_run(run_id, state)


@router.post("/runs/{run_id}/rounds/{round_id}/vote")
def submit_round_vote(run_id: str, round_id: str, body: VoteBody) -> dict[str, Any]:
    state = require_v3_run(run_id)
    ensure_current_round(state, round_id, {"ROUND_VOTE", "RECAP"})
    existing = next((item for item in state["votes"] if item["roundId"] == round_id), None)
    if existing:
        return state
    suspect_name(body.suspectId)
    if not body.reasonEvidenceId or not evidence_by_id(state, body.reasonEvidenceId):
        raise HTTPException(status_code=422, detail="REASON_EVIDENCE_REQUIRED")
    vote = {
        "voteId": body.voteId,
        "roundId": round_id,
        "suspectId": body.suspectId,
        "role": body.role,
        "confidence": body.confidence,
        "reasonEvidenceId": body.reasonEvidenceId,
        "createdAt": now_iso(),
    }
    with connect() as conn:
        conn.execute(
            """INSERT INTO v3_votes
            (vote_id, run_id, round_id, suspect_id, role, confidence, reason_evidence_id, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (body.voteId, run_id, round_id, body.suspectId, body.role, body.confidence, body.reasonEvidenceId, vote["createdAt"]),
        )
    state["votes"].append(vote)
    state["roundStates"][round_id]["status"] = "VOTED"
    state["status"] = "RECAP"
    state["lastPage"] = f"/round/{round_id}/recap"
    log_event("v3_round_vote", run_id, {"roundId": round_id, "suspectId": body.suspectId})
    return save_run(run_id, state)


@router.post("/runs/{run_id}/rounds/{round_id}/recap")
def generate_recap(run_id: str, round_id: str) -> dict[str, Any]:
    state = require_v3_run(run_id)
    ensure_current_round(state, round_id, {"RECAP"})
    if round_id in state["recaps"]:
        return state["recaps"][round_id]
    config = round_config(round_id)
    vote = next(item for item in state["votes"] if item["roundId"] == round_id)
    previous = state["votes"][-2] if len(state["votes"]) >= 2 else None
    name = suspect_name(vote["suspectId"])
    change = f"你把怀疑从{suspect_name(previous['suspectId'])}转向了{name}" if previous and previous["suspectId"] != vote["suspectId"] else f"你仍然最怀疑{name}"
    fallback = f"{change}。{config['fallbackAnswer']} {config['hook']}"
    prompt = (
        "你是看山侦探事务所的前情提示助手。根据固定文本写三句简短中文：确认玩家判断、指出证据缺口、引出下一轮。"
        "不得裁定真凶，不得新增数字、时间、来源或医学结论。"
        f"玩家判断：{change}。本轮已知：{config['fallbackAnswer']}。下一轮固定线索：{config['hook']}"
    )
    result = answer_zhihu(prompt, fallback, timeout_seconds=8)
    recap = {
        "recapId": f"recap_{uuid.uuid4().hex[:10]}",
        "roundId": round_id,
        "voteId": vote["voteId"],
        "text": result["answer"],
        "cta": "完成最终指认" if round_id == "R7" else f"进入第{config['index'] + 1}轮",
        "fallbackUsed": result["fallbackUsed"],
        "createdAt": now_iso(),
    }
    with connect() as conn:
        conn.execute(
            """INSERT INTO v3_recaps(recap_id, run_id, round_id, vote_id, recap_json, created_at)
            VALUES (?, ?, ?, ?, ?, ?)""",
            (recap["recapId"], run_id, round_id, vote["voteId"], json.dumps(recap, ensure_ascii=False), recap["createdAt"]),
        )
    state["recaps"][round_id] = recap
    if result["fallbackUsed"]:
        state["fallbackUsed"] = True
    save_run(run_id, state)
    log_event("v3_recap_generate", run_id, {"roundId": round_id, "fallback": result["fallbackUsed"]})
    return recap


@router.post("/runs/{run_id}/rounds/{round_id}/continue")
def continue_round(run_id: str, round_id: str) -> dict[str, Any]:
    state = require_v3_run(run_id)
    ensure_current_round(state, round_id, {"RECAP"})
    if round_id not in state["recaps"]:
        generate_recap(run_id, round_id)
        state = require_v3_run(run_id)
    state["roundStates"][round_id]["status"] = "RECAP_DONE"
    if state["currentRound"] >= 7:
        state["status"] = "FINAL_READY"
        state["lastPage"] = "/board"
    else:
        state["currentRound"] += 1
        next_id = current_round_id(state)
        state["roundStates"][next_id]["status"] = "ACTIVE"
        state["status"] = "ROUND_ACTIVE"
        state["lastPage"] = f"/round/{next_id}"
    log_event("v3_round_continue", run_id, {"roundId": round_id, "nextRound": state["currentRound"]})
    return save_run(run_id, state)


def contains_any(text: str, terms: list[str]) -> bool:
    return any(term in text for term in terms)


def grade_dimension(
    dimension_id: str,
    label: str,
    score: int,
    max_score: int,
    complete_at: int,
    partial_at: int,
    complete_summary: str,
    partial_summary: str,
    missing_summary: str,
) -> dict[str, Any]:
    if score >= complete_at:
        status, status_label, summary = "complete", "已完成", complete_summary
    elif score >= partial_at:
        status, status_label, summary = "partial", "部分完成", partial_summary
    else:
        status, status_label, summary = "missing", "仍待补充", missing_summary
    return {
        "id": dimension_id,
        "label": label,
        "score": score,
        "maxScore": max_score,
        "status": status,
        "statusLabel": status_label,
        "summary": summary,
    }


def score_final_decision(body: FinalBody, selected: list[dict[str, Any]], red_herring: dict[str, Any]) -> dict[str, Any]:
    selected_ids = {item["id"] for item in selected}
    reason = body.reason.strip()

    reconstruction = {"PRESSURE": 20, "COLD": 10, "NOISE": 10, "BLUE": 3}.get(body.culpritId, 0)
    reconstruction += 7 if body.accompliceId == "COLD" else 5 if body.accompliceId == "NOISE" else 0
    reconstruction += 3 if red_herring["id"] == "E01" else 0
    reconstruction = min(30, reconstruction)

    evidence_points = {"E07": 12, "E10": 12, "E05": 8, "E03": 6, "E08": 5, "E04": 4, "E02": 2, "E06": 2, "E09": 0}
    evidence_quality = sum(evidence_points.get(evidence_id, 0) for evidence_id in selected_ids)
    selected_relations = {item.get("relation") for item in selected}
    if "支持" in selected_relations and "削弱" in selected_relations:
        evidence_quality += 6
    evidence_quality = min(30, evidence_quality)

    counter_evidence = 12 if red_herring["id"] == "E01" else 0
    if selected_ids.intersection({"E10", "E13"}):
        counter_evidence += 5
    explains_25_of_45 = "25" in reason and "45" in reason and contains_any(reason, ["不能", "不足", "只", "部分"])
    if explains_25_of_45:
        counter_evidence += 3
    counter_evidence = min(20, counter_evidence)

    cites_case_fact = contains_any(reason, ["22:20", "22:26", "工作消息", "担忧备忘", "心率", "对照夜", "31分钟", "16:40", "三次声音"])
    explains_mechanism = "压力" in reason and contains_any(reason, ["高唤醒", "担忧", "心率", "碎片", "稳定", "觉醒"])
    explains_other_limits = contains_any(reason, ["手机", "咖啡", "噪声", "声音"]) and contains_any(reason, ["不能", "不足", "只能", "部分", "无法", "不充分"])
    keeps_boundary = contains_any(reason, ["可能", "支持", "不能直接证明", "不能证明", "相关", "因果", "候选", "不充分"])
    absolute_claim = contains_any(reason, ["研究已经证明刘看山", "医生已经证明刘看山", "看山助手已经证明", "研究证明刘看山就是", "必然是唯一原因", "确定是唯一原因"])
    boundary_score = sum([cites_case_fact, explains_mechanism, explains_other_limits, keeps_boundary]) * 5
    if absolute_claim:
        boundary_score = min(boundary_score, 10)

    score = reconstruction + evidence_quality + counter_evidence + boundary_score
    has_weaken_evidence = bool(selected_ids.intersection({"E10", "E13"})) or "削弱" in selected_relations
    s_hard_conditions = {
        "culprit": body.culpritId == "PRESSURE",
        "individualFact": "E07" in selected_ids,
        "counterEvidence": has_weaken_evidence,
        "redHerring": red_herring["id"] == "E01",
        "reasonComplete": cites_case_fact and explains_mechanism and explains_other_limits,
        "boundarySafe": not absolute_claim,
    }
    grade = "S" if score >= 85 and all(s_hard_conditions.values()) else "A" if score >= 65 else "B"
    grade_copy = {
        "S": ("证据链完整", "你不仅找到了最可能的主因，还通过案件事实、对照证据和反证排除了最显眼的干扰项。你的结论保留了必要的证据边界。"),
        "A": ("主要方向成立", "你找到了案件的主要方向，证据也能支持当前判断。不过，角色关系、反证或因果边界仍有一处没有完全闭合。"),
        "B": ("调查完成，结论仍待复核", "你完成了全部调查并形成了自己的判断，但目前的结论仍较依赖显眼线索或一般观点。补充个体事实和反证后，证据链会更加完整。"),
    }
    grade_name, grade_description = grade_copy[grade]
    reasons = [
        grade_dimension("reconstruction", "案件重建", reconstruction, 30, 25, 10, "主因与共同作用角色判断一致", "主要方向成立，角色关系仍可补充", "尚未形成完整的案件角色重建"),
        grade_dimension("evidence", "证据质量", evidence_quality, 30, 24, 8, "同时使用事实与对照证据", "已有支持材料，对照或事实仍可加强", "关键证据较依赖一般观点"),
        grade_dimension("counterEvidence", "反证意识", counter_evidence, 20, 17, 5, "识别误导线索并使用削弱证据", "已注意到证据缺口，反证链仍待闭合", "尚未识别最显眼的误导线索"),
        grade_dimension("boundaries", "推理边界", boundary_score, 20, 15, 5, "保留了相关与因果的区别", "已保留部分限制，仍有绝对化风险", "理由尚未说明证据限制"),
    ]
    return {
        "grade": grade,
        "score": score,
        "gradeName": grade_name,
        "gradeDescription": grade_description,
        "gradeReasons": reasons,
        "gradeHardConditions": s_hard_conditions,
    }


@router.post("/runs/{run_id}/final-decisions")
def final_decision(run_id: str, body: FinalBody) -> dict[str, Any]:
    state = require_v3_run(run_id)
    if state["status"] not in {"FINAL_READY", "FINAL_VOTE"}:
        raise HTTPException(status_code=409, detail="INVALID_STATE")
    suspect_name(body.culpritId)
    if body.accompliceId:
        suspect_name(body.accompliceId)
    if body.accompliceId == body.culpritId:
        raise HTTPException(status_code=422, detail="DUPLICATE_SUSPECT")
    selected = [evidence_by_id(state, item) for item in body.evidenceIds]
    if any(item is None or not item.get("eligibleForFinal") for item in selected):
        raise HTTPException(status_code=422, detail="FINAL_EVIDENCE_INVALID")
    if all(str(item.get("sourceType", "")).startswith("AI") for item in selected if item):
        raise HTTPException(status_code=422, detail="AI_EVIDENCE_PAIR_INVALID")
    red_herring = evidence_by_id(state, body.redHerringId)
    if not red_herring:
        raise HTTPException(status_code=422, detail="RED_HERRING_REQUIRED")

    case = case_config()
    truth = case["truth"]
    grading = score_final_decision(body, selected, red_herring)
    grade = grading["grade"]
    vote_changes = sum(1 for left, right in zip(state["votes"], state["votes"][1:]) if left["suspectId"] != right["suspectId"])
    report = {
        "reportId": f"v3_report_{uuid.uuid4().hex[:10]}",
        **grading,
        "culprit": {"id": body.culpritId, "name": suspect_name(body.culpritId)},
        "accomplice": {"id": body.accompliceId, "name": suspect_name(body.accompliceId)},
        "evidence": selected,
        "redHerring": red_herring,
        "reason": body.reason.strip(),
        "truthReconstruction": truth["reconstruction"],
        "official": {
            "culprit": suspect_name(truth["culprit"]),
            "accomplice": suspect_name(truth["accomplice"]),
            "trigger": suspect_name(truth["trigger"]),
            "redHerring": suspect_name(truth["redHerring"]),
        },
        "votePath": state["votes"],
        "voteChanges": vote_changes,
        "fallbackUsed": state["fallbackUsed"],
        "comment": case["report"]["comment"],
        "closingMessage": case["report"]["closingMessage"],
        "recommendations": case["report"]["recommendations"],
        "shareDraft": case["report"]["shareTemplate"].format(culprit=suspect_name(body.culpritId)),
        "createdAt": now_iso(),
    }
    decision = body.model_dump()
    with connect() as conn:
        conn.execute(
            "INSERT INTO v3_final_decisions(decision_id, run_id, decision_json, created_at) VALUES (?, ?, ?, ?)",
            (body.decisionId, run_id, json.dumps(decision, ensure_ascii=False), now_iso()),
        )
        conn.execute(
            """INSERT OR REPLACE INTO reports(report_id, run_id, grade, assisted, report_json, created_at)
            VALUES (?, ?, ?, 0, ?, ?)""",
            (report["reportId"], run_id, grade, json.dumps(report, ensure_ascii=False), report["createdAt"]),
        )
    state["status"] = "CLOSED"
    state["lastPage"] = "/report"
    state["report"] = report
    log_event("v3_case_close", run_id, {"grade": grade, "culpritId": body.culpritId})
    return save_run(run_id, state)


@router.get("/runs/{run_id}/report")
def get_report(run_id: str) -> dict[str, Any]:
    state = require_v3_run(run_id)
    if state["status"] != "CLOSED" or not state.get("report"):
        raise HTTPException(status_code=409, detail="CASE_NOT_CLOSED")
    return state["report"]
