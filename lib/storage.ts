import { isSheetsConfigured } from "@/lib/config";
import { createDemoLog } from "@/lib/demo-data";
import { formatJstTime, getTodayJst, JAPAN_TIME_ZONE, normalizeLogTimestamps, nowJstIso, shiftDate } from "@/lib/date";
import { calculateScores, SCORE_VERSION } from "@/lib/scoring";
import { SheetsStorage } from "@/lib/sheets";
import type { LogStorage } from "@/lib/storage-types";
import type { AiInsight, DailyLog, DailyLogInput, DailyLogSummary, Habit, HabitInput, HabitLog, ScoreBreakdown } from "@/types/domain";

const memory = globalThis as typeof globalThis & {
  __powerUpMemoryStorage?: MemoryStorage;
};

function summary(log: DailyLog): DailyLogSummary {
  const current = refreshLog(log);
  return {
    date: current.date,
    totalScore: current.scores.total,
    recordingRate: current.scores.recordingRate,
    scores: {
      sleep: current.scores.sleep,
      food: current.scores.food,
      phone: current.scores.phone,
      result: current.scores.result,
    },
    status: current.status,
  };
}

function refreshLog(log: DailyLog): DailyLog {
  const normalized = normalizeLogTimestamps(log);
  const input: DailyLogInput = { ...normalized, scoreVersion: SCORE_VERSION };
  return {
    ...normalized,
    scoreVersion: SCORE_VERSION,
    scores: calculateScores(input),
  };
}

export class MemoryStorage implements LogStorage {
  private readonly logs = new Map<string, DailyLog>();
  private readonly requestResults = new Map<string, DailyLog>();
  private readonly habits = new Map<string, Habit>();
  private readonly habitLogs = new Map<string, HabitLog>();

  constructor() {
    if (this.logs.size === 0) {
      [0, 1, 2, 3, 4, 5, 6].forEach((offset) => {
        const date = shiftDate(getTodayJst(), -offset);
        const demo = createDemoLog(date);
        this.logs.set(date, demo);
      });
    }
  }

  async list(from: string, to: string) {
    return [...this.logs.values()]
      .filter((log) => log.date >= from && log.date <= to)
      .sort((a, b) => b.date.localeCompare(a.date))
      .map(summary);
  }

  async get(date: string) {
    const log = this.logs.get(date);
    return log ? refreshLog(log) : null;
  }

  async upsert(input: DailyLogInput, scores: ScoreBreakdown, clientRequestId: string) {
    const previousRequest = this.requestResults.get(clientRequestId);
    if (previousRequest) return previousRequest;
    const existing = this.logs.get(input.date);
    const normalizedExisting = existing ? normalizeLogTimestamps(existing) : undefined;
    const now = nowJstIso();
    const log: DailyLog = {
      ...input,
      id: normalizedExisting?.id ?? `log-${input.date}`,
      status: input.aiInsight?.confirmed ? "confirmed" : "draft",
      scores,
      createdAt: normalizedExisting?.createdAt ?? now,
      updatedAt: now,
      timeline: [
        ...(normalizedExisting?.timeline ?? []),
        {
          time: formatJstTime(now) ?? "—",
          label: "日次ログを保存",
          detail: clientRequestId,
          timeZone: JAPAN_TIME_ZONE,
        },
      ].slice(-12),
    };
    this.logs.set(input.date, log);
    this.requestResults.set(clientRequestId, log);
    return log;
  }

  async saveAiInsight(date: string, insight: AiInsight) {
    const existing = this.logs.get(date);
    if (!existing) return null;
    const normalizedExisting = normalizeLogTimestamps(existing);
    const input: DailyLogInput = { ...normalizedExisting, aiInsight: { ...insight, confirmed: true } };
    const result = { ...normalizedExisting, ...input, status: "confirmed" as const, updatedAt: nowJstIso() };
    this.logs.set(date, result);
    return result;
  }

  async listHabits(includeInactive = false) {
    return [...this.habits.values()]
      .filter((habit) => includeInactive || habit.active)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async upsertHabit(input: HabitInput, habitId?: string) {
    const existing = habitId ? this.habits.get(habitId) : undefined;
    const now = nowJstIso();
    const habit: Habit = {
      ...input,
      id: existing?.id ?? habitId ?? `habit-${crypto.randomUUID()}`,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    this.habits.set(habit.id, habit);
    return habit;
  }

  async listHabitLogs(from: string, to: string) {
    return [...this.habitLogs.values()]
      .filter((log) => log.date >= from && log.date <= to)
      .sort((a, b) => a.date.localeCompare(b.date) || a.habitId.localeCompare(b.habitId));
  }

  async upsertHabitLog(habitId: string, date: string, completed: boolean) {
    const log: HabitLog = { habitId, date, completed, updatedAt: nowJstIso() };
    this.habitLogs.set(`${habitId}:${date}`, log);
    return log;
  }
}

function getMemoryStorage() {
  memory.__powerUpMemoryStorage ??= new MemoryStorage();
  return memory.__powerUpMemoryStorage;
}

export function getStorage(): LogStorage {
  if (isSheetsConfigured()) return new SheetsStorage();
  if (process.env.NODE_ENV === "production") {
    throw new Error("Google Sheets environment variables are not configured.");
  }
  return getMemoryStorage();
}

export { summary as toDailyLogSummary };
