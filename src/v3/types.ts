export interface Suspect {
  id: string;
  name: string;
  alias: string;
  color: string;
  icon: "smartphone" | "coffee" | "volume" | "briefcase";
  summary: string;
}

export interface TimelineItem {
  time: string;
  title: string;
  round: number;
  detail: string;
}

export interface RoundConfig {
  id: string;
  index: number;
  title: string;
  shortTitle: string;
  mode: "search" | "professional" | "comments" | "research" | "assistant" | "comparison" | "targeted_search";
  clue: string;
  objective: string;
  focusFacts: Array<{
    label: string;
    value: string;
    tone: "blue" | "red" | "gold" | "green";
  }>;
  queries?: string[];
  queriesBySuspect?: Record<string, string>;
  evidenceRewards: string[];
  hook: string;
  fallbackAnswer: string;
  assistantIntro?: string;
  assistantPrompts?: AssistantPrompt[];
  comparisonRows?: Array<{
    id: "phone" | "coffee" | "pressure" | "environment" | "sleep";
    label: string;
    caseNight: string;
    controlNight: string;
    status: string;
    same: boolean;
  }>;
  comparisonJudgement?: {
    question: string;
    options: Array<{ id: string; label: string; correct: boolean }>;
    correctFeedback: string;
    incorrectFeedback: string;
  };
  reviewBySuspect?: Record<string, {
    assumption: string;
    changeConditions: string[];
    supportQuery: string;
    challengeQuery: string;
  }>;
}

export interface AssistantPrompt {
  id: string;
  question: string;
  tag: string;
  intro: string;
  points: Array<{
    label: string;
    text: string;
    tone?: "blue" | "red" | "gold" | "orange" | "neutral";
  }>;
  observation: string;
}

export interface SourceSnapshot {
  id: string;
  roundId: string;
  title: string;
  author: string;
  authorType: string;
  url: string;
  body: string;
  excerpts?: string[];
  comments?: Array<{ id: string; relation: string; text: string }>;
  commentLinks?: Array<{
    id: string;
    label: string;
    focus: string;
    url: string;
    tone: "experience" | "challenge" | "alternative";
  }>;
  caseAlignment?: Array<{ label: string; value: string }>;
  caseConclusion?: string;
  limitations: string;
  sample?: string;
}

export interface EvidenceRecord {
  id: string;
  roundId: string;
  title: string;
  sourceType: string;
  reliability: string;
  relation: string;
  suspectIds: string[];
  eligibleForFinal: boolean;
  excerpt: string;
  limitations: string;
  sourceId?: string;
  sourceTitle?: string;
  sourceUrl?: string;
}

export interface Vote {
  voteId: string;
  roundId: string;
  suspectId: string;
  role: string;
  confidence: string;
  reasonEvidenceId?: string;
}

export interface Recap {
  recapId: string;
  roundId: string;
  voteId: string;
  text: string;
  cta: string;
  fallbackUsed: boolean;
}

export interface AssistantTurn {
  turnId: string;
  question: string;
  answer: string;
  fallbackUsed: boolean;
  source: string;
  citationIds: string[];
}

export interface ReportRecommendation {
  id: string;
  title: string;
  topic?: string;
  author?: string;
  summary?: string;
  reason: string;
  url: string;
}

export interface V3Report {
  reportId: string;
  gradingVersion?: string;
  grade: string;
  score: number;
  gradeName: string;
  gradeDescription: string;
  gradeReasons: Array<{
    id: "completion" | "reconstruction" | "evidence" | "misleading" | "reasoning";
    label: string;
    score: number;
    maxScore: number;
    status: "complete" | "partial" | "missing";
    statusLabel: string;
    summary: string;
  }>;
  culprit: { id: string; name: string };
  accomplice: { id?: string; name: string };
  evidence: EvidenceRecord[];
  redHerring: EvidenceRecord;
  reason: string;
  truthReconstruction: string;
  official: Record<string, string>;
  votePath: Vote[];
  voteChanges: number;
  fallbackUsed: boolean;
  comment: string;
  closingMessage: string;
  recommendations: ReportRecommendation[];
  shareDraft: string;
}

export interface V3Case {
  caseId: string;
  version: number;
  caseNumber: string;
  title: string;
  question: string;
  brief: string;
  duration: string;
  roundCount: number;
  disclaimer: string;
  suspects: Suspect[];
  timeline: TimelineItem[];
  rounds: RoundConfig[];
  sources: SourceSnapshot[];
  evidenceBlueprints: Array<Record<string, unknown>>;
  report: {
    shareTemplate: string;
    comment: string;
    closingMessage: string;
    recommendations: ReportRecommendation[];
  };
}

export interface V3Run {
  runId: string;
  caseId: string;
  caseVersion: number;
  detectiveName?: string;
  status: string;
  lastPage: string;
  currentRound: number;
  roundStates: Record<string, { status: string; payload: Record<string, unknown>; evidenceIds: string[]; searchQuery?: string; searchResults?: SearchResult[] }>;
  votes: Vote[];
  evidenceRecords: EvidenceRecord[];
  assistantTurns: AssistantTurn[];
  recaps: Record<string, Recap>;
  fallbackUsed: boolean;
  report?: V3Report;
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

export interface AwardEvent {
  sequence: number;
  eventId: string;
  runId: string;
  caseId: string;
  grade: string;
  detectiveName: string;
  message: string;
  createdAt: string;
}
