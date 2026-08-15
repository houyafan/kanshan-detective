import type { AssistantTurn, AwardEvent, Recap, SearchResult, V3Case, V3Run } from "./types";

const headers = { "Content-Type": "application/json" };

const errorMessages: Record<string, string> = {
  RUN_NOT_FOUND: "没有找到这份调查记录，请从首页重新接案。",
  RUN_VERSION_MISMATCH: "这份记录来自旧版本，请新建一轮 V3 调查。",
  ROUND_NOT_FOUND: "未找到对应调查轮次。",
  ROUND_NOT_ACTIVE: "当前轮次尚未开放，请先完成前面的调查。",
  INVALID_SUSPECT: "请选择案件中的有效嫌疑人。",
  INVALID_STATE: "当前进度不能执行这个操作，请刷新后继续。",
  SEARCH_NOT_ALLOWED: "本轮不支持搜索，请按本轮任务完成取证。",
  ASSISTANT_TURNS_COMPLETE: "本轮两次协查已经完成，可以收录证据。",
  TWO_ASSISTANT_TURNS_REQUIRED: "请先查看一个看山助手分析视角。",
  ASSISTANT_VIEW_REQUIRED: "请先查看一个看山助手分析视角。",
  COMPARISON_JUDGEMENT_REQUIRED: "请先完成对照夜的证据作用判断。",
  REVERSE_CHECK_REQUIRED: "请先定义改票条件，并收录不同来源的支持与挑战证据。",
  REASON_EVIDENCE_REQUIRED: "请选择一条已收录证据作为投票理由。",
  DUPLICATE_SUSPECT: "主因和共同作用对象不能是同一名嫌疑人。",
  FINAL_EVIDENCE_INVALID: "请选择两张可用于结案的有效证据。",
  AI_EVIDENCE_PAIR_INVALID: "AI 协查不能作为唯一证据，请搭配一张事实或来源证据。",
  RED_HERRING_REQUIRED: "请选择一张误导线索后再提交指认。",
  CASE_NOT_CLOSED: "案件尚未结案，暂时无法生成报告。"
};

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    const body = await response.json().catch(() => ({ detail: "请求失败" }));
    const detail = typeof body.detail === "string" ? body.detail : "请求失败";
    throw new Error(errorMessages[detail] || detail);
  }
  return response.json() as Promise<T>;
}

export const v3Api = {
  case: () => request<V3Case>("/api/v3/case/current"),
  createRun: () => request<V3Run>("/api/v3/runs", { method: "POST" }),
  getRun: (runId: string) => request<V3Run>(`/api/v3/runs/${runId}`),
  confirmBrief: (runId: string) => request<V3Run>(`/api/v3/runs/${runId}/brief/confirm`, { method: "POST" }),
  initialVote: (runId: string, body: Record<string, unknown>) => request<V3Run>(`/api/v3/runs/${runId}/votes/initial`, { method: "POST", headers, body: JSON.stringify(body) }),
  search: (runId: string, roundId: string, query: string) => request<{ results: SearchResult[]; fallbackUsed: boolean; source: string }>(`/api/v3/runs/${runId}/rounds/${roundId}/search`, { method: "POST", headers, body: JSON.stringify({ query, mode: "auto" }) }),
  completeRound: (runId: string, roundId: string, payload: Record<string, unknown>) => request<V3Run>(`/api/v3/runs/${runId}/rounds/${roundId}/complete`, { method: "POST", headers, body: JSON.stringify({ actionId: crypto.randomUUID(), payload }) }),
  vote: (runId: string, roundId: string, body: Record<string, unknown>) => request<V3Run>(`/api/v3/runs/${runId}/rounds/${roundId}/vote`, { method: "POST", headers, body: JSON.stringify(body) }),
  recap: (runId: string, roundId: string) => request<Recap>(`/api/v3/runs/${runId}/rounds/${roundId}/recap`, { method: "POST" }),
  continueRound: (runId: string, roundId: string) => request<V3Run>(`/api/v3/runs/${runId}/rounds/${roundId}/continue`, { method: "POST" }),
  assistant: (runId: string, question: string) => request<AssistantTurn>(`/api/v3/runs/${runId}/assistant/turns`, { method: "POST", headers, body: JSON.stringify({ turnId: crypto.randomUUID(), question }) }),
  finalDecision: (runId: string, body: Record<string, unknown>) => request<V3Run>(`/api/v3/runs/${runId}/final-decisions`, { method: "POST", headers, body: JSON.stringify({ decisionId: crypto.randomUUID(), ...body }) }),
  recentAwards: (limit = 5) => request<{ events: AwardEvent[] }>(`/api/v3/awards/recent?limit=${limit}`)
};
