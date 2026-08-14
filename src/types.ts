export type TaskStatus = "LOCKED" | "AVAILABLE" | "IN_PROGRESS" | "COMPLETED" | "ERROR";

export interface TaskConfig {
  id: string;
  kind: string;
  title: string;
  subtitle: string;
  reward: string;
  optional?: boolean;
}

export interface Evidence {
  id: string;
  title: string;
  type: string;
  reliability: string;
  relation: string;
  eligible: boolean;
  required?: boolean;
  supportsOptionIds: string[];
  excerpt: string;
  source: string;
  sourceUrl: string;
  fallback?: boolean;
}

export interface SearchResult {
  sourceId: string;
  title: string;
  author: string;
  summary: string;
  url: string;
  type: string;
  fallback: boolean;
}

export interface CaseConfig {
  caseId: string;
  caseNumber: string;
  title: string;
  question: string;
  brief: string;
  difficulty: string;
  duration: string;
  disclaimer: string;
  recommendedQueries: string[];
  tasks: TaskConfig[];
  evidence: Evidence[];
  dossiers: Array<{
    id: string;
    title: string;
    author: string;
    body: string;
    excerpts: Array<{ id: string; text: string }>;
  }>;
  comparison: {
    viewpoints: Array<{ id: string; label: string; text: string; source: string }>;
    reasonTags: string[];
  };
  keySource: {
    title: string;
    source: string;
    publishedAt: string;
    excerpt: string;
    supports: string;
    limitation: string;
  };
  puzzle: string[];
  reasoning: {
    question: string;
    options: Array<{ id: string; label: string }>;
  };
  copy: Record<string, string>;
  report: Record<string, string>;
}

export interface Report {
  reportId: string;
  grade: string;
  assisted: boolean;
  attemptCount: number;
  durationSeconds: number;
  selectedOption: { id: string; label: string };
  evidenceChain: Evidence[];
  conclusion: string;
  limitation: string;
  comment: string;
  sources: Array<{ title: string; url: string; source: string }>;
  fallbackUsed: boolean;
  shareDraft: string;
}

export interface RunState {
  runId: string;
  caseId: string;
  status: string;
  lastPage: string;
  taskStates: Record<string, TaskStatus>;
  evidenceIds: string[];
  evidenceDetails: Record<string, Partial<Evidence>>;
  pieceIds: string[];
  hintRemaining: number;
  attemptCount: number;
  draftReasoning: Record<string, unknown> | null;
  noteDraft: string;
  fallbackUsed: boolean;
  startedAt?: string;
  report?: Report;
  updatedAt: string;
}
