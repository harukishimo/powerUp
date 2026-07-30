import { isSheetsConfigured } from "@/lib/config";
import { createDemoLog } from "@/lib/demo-data";
import { getTodayJst, shiftDate } from "@/lib/date";
import { calculateScores, SCORE_VERSION } from "@/lib/scoring";
import { SheetsStorage } from "@/lib/sheets";
import type { LogStorage } from "@/lib/storage-types";
import type { AiInsight, DailyLog, DailyLogInput, DailyLogSummary, ScoreBreakdown } from "@/types/domain";

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
  const input: DailyLogInput = { ...log, scoreVersion: SCORE_VERSION };
  return {
    ...log,
    scoreVersion: SCORE_VERSION,
    scores: calculateScores(input),
  };
}

export class MemoryStorage implements LogStorage {
  private readonly logs = new Map<string, DailyLog>();
  private readonly requestResults = new Map<string, DailyLog>();

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
    const now = new Date().toISOString();
    const log: DailyLog = {
      ...input,
      id: existing?.id ?? `log-${input.date}`,
      status: input.aiInsight?.confirmed ? "confirmed" : "draft",
      scores,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      timeline: existing?.timeline ?? [{ time: now.slice(11, 16), label: "日次ログを保存", detail: clientRequestId }],
    };
    this.logs.set(input.date, log);
    this.requestResults.set(clientRequestId, log);
    return log;
  }

  async saveAiInsight(date: string, insight: AiInsight) {
    const existing = this.logs.get(date);
    if (!existing) return null;
    const input: DailyLogInput = { ...existing, aiInsight: { ...insight, confirmed: true } };
    const result = { ...existing, ...input, status: "confirmed" as const, updatedAt: new Date().toISOString() };
    this.logs.set(date, result);
    return result;
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
