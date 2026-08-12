import type { AiInsight, DailyLog, DailyLogInput, DailyLogSummary, FocusDailyLog, FocusDailyLogInput, Habit, HabitInput, HabitLog, ScoreBreakdown } from "@/types/domain";

export interface LogStorage {
  list(from: string, to: string): Promise<DailyLogSummary[]>;
  get(date: string): Promise<DailyLog | null>;
  upsert(input: DailyLogInput, scores: ScoreBreakdown, clientRequestId: string): Promise<DailyLog>;
  saveAiInsight(date: string, insight: AiInsight): Promise<DailyLog | null>;
  listHabits(includeInactive?: boolean): Promise<Habit[]>;
  upsertHabit(input: HabitInput, habitId?: string): Promise<Habit>;
  listHabitLogs(from: string, to: string): Promise<HabitLog[]>;
  upsertHabitLog(habitId: string, date: string, completed: boolean): Promise<HabitLog>;
  listFocusLogs(from: string, to: string): Promise<FocusDailyLog[]>;
  upsertFocusLog(input: FocusDailyLogInput): Promise<FocusDailyLog>;
}
