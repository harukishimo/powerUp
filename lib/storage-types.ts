import type { AiInsight, DailyLog, DailyLogInput, DailyLogSummary, ScoreBreakdown } from "@/types/domain";

export interface LogStorage {
  list(from: string, to: string): Promise<DailyLogSummary[]>;
  get(date: string): Promise<DailyLog | null>;
  upsert(input: DailyLogInput, scores: ScoreBreakdown, clientRequestId: string): Promise<DailyLog>;
  saveAiInsight(date: string, insight: AiInsight): Promise<DailyLog | null>;
}
