import type { NormalizedJob } from "./portals.js";

export interface DimensionScores {
  technical: number;
  experience: number;
  behavioral: number;
  career: number;
}

export type Gate = "PASS" | "FAIL" | "FLAG" | "UNKNOWN";

export interface RankInput {
  job: NormalizedJob;
  scores: DimensionScores;
  workRights: Exclude<Gate, "FLAG">;
  location: Gate;
  deadline: string | null;
  strengths: string[];
  gaps: string[];
  language?: string;
}

export type Verdict = "Strong Fit" | "Good Fit" | "Moderate Fit" | "Weak Fit" | "Poor Fit";

export interface RankedJob extends NormalizedJob {
  score: number;
  verdict: Verdict;
  rankDate: string;
  locationGate: Gate;
  deadline: string | null;
  urgent: boolean;
  strengths: string[];
  gaps: string[];
  language?: string;
}

export interface ExcludedJob extends NormalizedJob {
  status: "excluded" | "expired";
  reason: "work-rights-fail" | "work-rights-unknown" | "location-fail" | "deadline-expired" | "deadline-invalid";
  deadline: string | null;
}

export interface RankResult {
  ranked: RankedJob[];
  excluded: ExcludedJob[];
}

const WEIGHTS: DimensionScores = { technical: 0.3, experience: 0.25, behavioral: 0.15, career: 0.3 };

function validScore(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 100;
}

export function weightedScore(scores: DimensionScores): number {
  if (!Object.values(scores).every(validScore)) throw new Error("rank dimension scores must be between 0 and 100");
  const total = scores.technical * WEIGHTS.technical + scores.experience * WEIGHTS.experience +
    scores.behavioral * WEIGHTS.behavioral + scores.career * WEIGHTS.career;
  return Math.round(total * 100) / 100;
}

export function verdictForScore(score: number): Verdict {
  if (score >= 75) return "Strong Fit";
  if (score >= 60) return "Good Fit";
  if (score >= 45) return "Moderate Fit";
  if (score >= 30) return "Weak Fit";
  return "Poor Fit";
}

function parseDate(value: string): number | null {
  const parsed = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(parsed) ? parsed : null;
}

function deadlineState(deadline: string | null, today: string): { expired: boolean; urgent: boolean; invalid: boolean } {
  if (!deadline) return { expired: false, urgent: false, invalid: false };
  const date = parseDate(deadline);
  const current = parseDate(today);
  if (date === null || current === null) return { expired: false, urgent: false, invalid: true };
  const days = Math.round((date - current) / 86_400_000);
  return { expired: days < 0, urgent: days >= 0 && days <= 7, invalid: false };
}

function exclusion(input: RankInput, status: ExcludedJob["status"], reason: ExcludedJob["reason"]): ExcludedJob {
  return { ...input.job, status, reason, deadline: input.deadline };
}

export function rankJobs(inputs: RankInput[], rankDate: string): RankResult {
  const ranked: RankedJob[] = [];
  const excluded: ExcludedJob[] = [];
  for (const input of inputs) {
    const deadline = deadlineState(input.deadline, rankDate);
    if (input.workRights === "FAIL") {
      excluded.push(exclusion(input, "excluded", "work-rights-fail"));
      continue;
    }
    if (input.workRights === "UNKNOWN") {
      excluded.push(exclusion(input, "excluded", "work-rights-unknown"));
      continue;
    }
    if (input.location === "FAIL") {
      excluded.push(exclusion(input, "excluded", "location-fail"));
      continue;
    }
    if (deadline.invalid) {
      excluded.push(exclusion(input, "excluded", "deadline-invalid"));
      continue;
    }
    if (deadline.expired) {
      excluded.push(exclusion(input, "expired", "deadline-expired"));
      continue;
    }
    ranked.push({
      ...input.job,
      score: weightedScore(input.scores),
      verdict: verdictForScore(weightedScore(input.scores)),
      rankDate,
      locationGate: input.location,
      deadline: input.deadline,
      urgent: deadline.urgent,
      strengths: [...input.strengths],
      gaps: [...input.gaps],
      language: input.language,
    });
  }
  ranked.sort((left, right) => right.score - left.score || Number(right.urgent) - Number(left.urgent) || left.title?.localeCompare(right.title ?? "") || 0);
  return { ranked, excluded };
}

export interface RankStateEntry {
  id: string;
  [key: string]: unknown;
}

export type RankState = Record<string, RankStateEntry>;

export interface RankStateUpdate {
  id: string;
  score?: number;
  verdict?: Verdict;
  rankDate?: string;
  status: "ranked" | "expired" | "excluded";
}

export function mergeRankState(state: RankState, updates: RankStateUpdate[]): RankState {
  const next: RankState = { ...state };
  for (const update of updates) {
    const previous = next[update.id] ?? { id: update.id };
    next[update.id] = {
      ...previous,
      ...(update.score === undefined ? {} : { score: update.score }),
      ...(update.verdict === undefined ? {} : { verdict: update.verdict }),
      ...(update.rankDate === undefined ? {} : { rankDate: update.rankDate }),
      status: update.status,
    };
  }
  return next;
}
