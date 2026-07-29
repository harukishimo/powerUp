import type { AiInsight, DailyLog, DailyLogInput, DailyLogSummary } from "@/types/domain";

export interface LogsListResponse {
  logs: DailyLogSummary[];
  range: { from: string; to: string };
}

export interface LogDetailResponse {
  log: DailyLog;
}

export interface SaveLogRequest extends DailyLogInput {
  clientRequestId: string;
}

export interface SaveLogResponse {
  saved: true;
  clientRequestId: string;
  log: DailyLog;
}

export interface AiScoreRequest {
  date: string;
  achievementText: string;
  reflectionRating: number | null;
  focusMinutes: number | null;
  foodSummary: Record<string, string>;
  deterministicScores: { sleep: number | null; food: number | null; phone: number | null };
}

export interface AiScoreResponse {
  proposal: AiInsight;
  provider: "gemini" | "fallback";
  model: string | null;
  requestId: string;
}
