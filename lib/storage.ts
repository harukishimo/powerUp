import { isSheetsConfigured } from "@/lib/config";
import { createDemoLog } from "@/lib/demo-data";
import { getTodayJst, shiftDate } from "@/lib/date";
import { SheetsStorage } from "@/lib/sheets";
import type { LogStorage } from "@/lib/storage-types";
import type { AiInsight, DailyLog, DailyLogInput, DailyLogSummary, ScoreBreakdown } from "@/types/domain";

const memory = globalThis as typeof globalThis & {
  __powerUpMemoryStorage?: MemoryStorage;
};

function summary(log: DailyLog): DailyLogSummary {
  return {
    date: log.date,
    totalScore: log.scores.total,
    recordingRate: log.scores.recordingRate,
    scores: {
      sleep: log.scores.sleep,
      food: log.scores.food,
      phone: log.scores.phone,
      result: log.scores.result,
    },
    status: log.status,
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
    return this.logs.get(date) ?? null;
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
