import type { CaseConfig, RunState, SearchResult } from "./types";

const jsonHeaders = { "Content-Type": "application/json" };

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    const payload = await response.json().catch(() => ({ detail: response.statusText }));
    throw new Error(payload.detail || "请求失败");
  }
  return response.json() as Promise<T>;
}

export const api = {
  case: () => request<CaseConfig>("/api/case/current"),
  commissionSearch: (query: string) =>
    request<{ results: SearchResult[]; fallbackUsed: boolean; source: string }>("/api/commissions/search", {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({ query, mode: "auto" })
    }),
  createRun: () => request<RunState>("/api/runs", { method: "POST" }),
  getRun: (runId: string) => request<RunState>(`/api/runs/${runId}`),
  patchRun: (runId: string, body: Record<string, unknown>) =>
    request<RunState>(`/api/runs/${runId}`, { method: "PATCH", headers: jsonHeaders, body: JSON.stringify(body) }),
  startRun: (runId: string) => request<RunState>(`/api/runs/${runId}/start`, { method: "POST" }),
  completeTask: (runId: string, taskId: string, payload: Record<string, unknown>) =>
    request<RunState>(`/api/runs/${runId}/tasks/${taskId}/complete`, {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({ payload })
    }),
  search: (runId: string, query: string, mode: "auto" | "demo") =>
    request<{ results: SearchResult[]; fallbackUsed: boolean; source: string }>(`/api/runs/${runId}/search`, {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({ query, mode })
    }),
  reason: (
    runId: string,
    body: { attemptId: string; selectedOptionId: string; evidenceIds: string[]; reason: string }
  ) =>
    request<{ success: boolean; feedback: string; attemptCount: number; state: RunState }>(`/api/runs/${runId}/reasoning`, {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify(body)
    }),
  assist: (runId: string) =>
    request<{ state: RunState }>(`/api/runs/${runId}/assist`, { method: "POST" })
};
