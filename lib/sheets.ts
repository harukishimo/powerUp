import { google, sheets_v4 } from "googleapis";
import { config } from "@/lib/config";
import { calculateMealPoints, calculateSnackItemPoints } from "@/lib/scoring";
import { DailyLogInputSchema } from "@/lib/validation";
import type { LogStorage } from "@/lib/storage-types";
import type { AiInsight, DailyLog, DailyLogInput, DailyLogSummary, MealInput, ScoreBreakdown, SnackInput } from "@/types/domain";

const DAILY_HEADERS = [
  "log_id",
  "user_key",
  "log_date",
  "sleep_score",
  "recovery_feeling",
  "food_score",
  "phone_score",
  "result_score",
  "total_score",
  "recording_rate",
  "focus_minutes",
  "achievement_text",
  "achievement_ai_score",
  "achievement_confirmed_score",
  "reflection_rating",
  "user_comment",
  "ai_suggestion",
  "score_version",
  "payload_json",
  "created_at",
  "updated_at",
];

const MEAL_HEADERS = [
  "meal_id",
  "user_key",
  "log_date",
  "meal_type",
  "eaten_at",
  "carbohydrate_level",
  "protein_level",
  "vegetable_level",
  "portion_level",
  "drink_type",
  "feature_flags",
  "walk_minutes",
  "post_meal_sleepiness",
  "meal_score",
  "score_source",
  "updated_at",
];

const SNACK_HEADERS = [
  "snack_id",
  "user_key",
  "log_date",
  "eaten_at",
  "occurred",
  "category",
  "amount_level",
  "planned",
  "before_bed",
  "snack_score",
  "note",
  "created_at",
  "updated_at",
];

const AI_HEADERS = [
  "request_id",
  "user_key",
  "log_date",
  "provider",
  "model",
  "prompt_version",
  "achievement_score",
  "confidence",
  "reason",
  "next_experiment",
  "confirmed",
  "created_at",
];

const USER_KEY = "default";

type SheetName = "daily_logs" | "meal_logs" | "snack_logs" | "ai_insights";

function cell(value: unknown) {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value);
}

function rowToObject(headers: string[], row: string[]) {
  return Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""]));
}

function buildAuth() {
  const privateKey = config.serviceAccountPrivateKey.replace(/\\n/g, "\n");
  return new google.auth.JWT({
    email: config.serviceAccountEmail,
    key: privateKey,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
}

export class SheetsStorage implements LogStorage {
  private readonly client: sheets_v4.Sheets;
  private readonly ensuredTabs = new Set<SheetName>();

  constructor() {
    this.client = google.sheets({ version: "v4", auth: buildAuth() });
  }

  private async ensureTab(tab: SheetName) {
    if (this.ensuredTabs.has(tab)) return;
    const spreadsheet = await this.client.spreadsheets.get({ spreadsheetId: config.spreadsheetId, fields: "sheets.properties.title" });
    const exists = spreadsheet.data.sheets?.some((sheet) => sheet.properties?.title === tab);
    if (!exists) {
      await this.client.spreadsheets.batchUpdate({ spreadsheetId: config.spreadsheetId, requestBody: { requests: [{ addSheet: { properties: { title: tab } } }] } });
    }
    this.ensuredTabs.add(tab);
  }

  private async values(tab: SheetName) {
    await this.ensureTab(tab);
    const response = await this.client.spreadsheets.values.get({
      spreadsheetId: config.spreadsheetId,
      range: `${tab}!A:Z`,
      majorDimension: "ROWS",
    });
    return (response.data.values ?? []) as string[][];
  }

  private async ensureHeaders(tab: SheetName, headers: string[]) {
    const rows = await this.values(tab);
    if (rows.length > 0) {
      const actualHeaders = rows[0] ?? [];
      const missing = headers.filter((header) => !actualHeaders.includes(header));
      if (missing.length > 0) throw new Error(`Google Sheets headers are not configured for ${tab}.`);
      return rows;
    }
    await this.client.spreadsheets.values.update({
      spreadsheetId: config.spreadsheetId,
      range: `${tab}!A1:${columnName(headers.length)}1`,
      valueInputOption: "RAW",
      requestBody: { values: [headers] },
    });
    return [headers];
  }

  private async upsertRow(tab: SheetName, headers: string[], keyHeader: string, keyValue: string, row: string[]) {
    const rows = await this.ensureHeaders(tab, headers);
    const actualHeaders = rows[0] ?? headers;
    const keyIndex = actualHeaders.indexOf(keyHeader);
    const rowIndex = rows.findIndex((candidate, index) => index > 0 && candidate[keyIndex] === keyValue);
    if (rowIndex >= 1) {
      const sheetRow = rowIndex + 1;
      await this.client.spreadsheets.values.update({
        spreadsheetId: config.spreadsheetId,
        range: `${tab}!A${sheetRow}:${columnName(row.length)}${sheetRow}`,
        valueInputOption: "RAW",
        requestBody: { values: [row] },
      });
    } else {
      await this.client.spreadsheets.values.append({
        spreadsheetId: config.spreadsheetId,
        range: `${tab}!A:${columnName(row.length)}`,
        valueInputOption: "RAW",
        insertDataOption: "INSERT_ROWS",
        requestBody: { values: [row] },
      });
    }
  }

  async list(from: string, to: string): Promise<DailyLogSummary[]> {
    const rows = await this.values("daily_logs");
    if (rows.length < 2) return [];
    const headers = rows[0];
    return rows
      .slice(1)
      .map((row) => rowToObject(headers, row))
      .filter((row) => row.log_date >= from && row.log_date <= to)
      .map((row) => {
        const payload = parsePayload(row.payload_json);
        return {
          date: row.log_date,
          totalScore: numberOrNull(row.total_score) ?? payload?.scores.total ?? null,
          recordingRate: Number(row.recording_rate || payload?.scores.recordingRate || 0),
          scores: {
            sleep: numberOrNull(row.sleep_score) ?? payload?.scores.sleep ?? null,
            food: numberOrNull(row.food_score) ?? payload?.scores.food ?? null,
            phone: numberOrNull(row.phone_score) ?? payload?.scores.phone ?? null,
            result: numberOrNull(row.result_score) ?? payload?.scores.result ?? null,
          },
          status: payload?.status ?? "draft",
        };
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  }

  async get(date: string): Promise<DailyLog | null> {
    const rows = await this.values("daily_logs");
    if (rows.length < 2) return null;
    const headers = rows[0];
    const row = rows.slice(1).map((value) => rowToObject(headers, value)).find((value) => value.log_date === date);
    return row ? parsePayload(row.payload_json) : null;
  }

  async upsert(input: DailyLogInput, scores: ScoreBreakdown, clientRequestId: string): Promise<DailyLog> {
    const parsed = DailyLogInputSchema.parse({
      ...input,
      clientRequestId: input.clientRequestId ?? clientRequestId,
      snacks: input.snacks.map((snack, index) => ({ ...snack, id: snack.id ?? `${input.date}-snack-${index + 1}` })),
    });
    const existing = await this.get(parsed.date);
    if (existing?.clientRequestId === clientRequestId) return existing;
    const now = new Date().toISOString();
    const log: DailyLog = {
      ...parsed,
      id: existing?.id ?? `log-${parsed.date}`,
      status: parsed.aiInsight?.confirmed ? "confirmed" : "draft",
      scores,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      timeline: [...(existing?.timeline ?? []), { time: now.slice(11, 16), label: "日次ログを保存", detail: clientRequestId }].slice(-12),
    };

    await this.upsertRow("daily_logs", DAILY_HEADERS, "log_date", parsed.date, dailyRow(log));
    for (const meal of parsed.meals) {
      await this.upsertRow("meal_logs", MEAL_HEADERS, "meal_id", `${parsed.date}-${meal.type}`, mealRow(parsed.date, meal));
    }
    for (const snack of parsed.snacks) {
      const snackId = snack.id ?? `${parsed.date}-snack-1`;
      await this.upsertRow("snack_logs", SNACK_HEADERS, "snack_id", snackId, snackRow(parsed.date, snack, snackId));
    }
    if (parsed.aiInsight) await this.saveAiInsight(parsed.date, parsed.aiInsight);
    return log;
  }

  async saveAiInsight(date: string, insight: AiInsight): Promise<DailyLog | null> {
    const existing = await this.get(date);
    if (!existing) return null;
    const now = new Date().toISOString();
    const confirmed = insight.confirmed === true;
    const updated: DailyLog = {
      ...existing,
      aiInsight: { ...insight, confirmed },
      status: confirmed ? "confirmed" : "proposed",
      updatedAt: now,
    };
    const requestId = insight.requestId ?? `ai-${date}-${Date.now()}`;
    await this.upsertRow("daily_logs", DAILY_HEADERS, "log_date", date, dailyRow(updated));
    await this.upsertRow("ai_insights", AI_HEADERS, "request_id", requestId, [
      requestId,
      USER_KEY,
      date,
      insight.provider ?? "gemini",
      insight.model ?? config.geminiModel,
      "v1",
      cell(insight.achievementScore),
      insight.confidence,
      insight.reason,
      insight.nextExperiment,
      cell(confirmed),
      now,
    ]);
    return updated;
  }
}

function dailyRow(log: DailyLog) {
  return [
    log.id,
    USER_KEY,
    log.date,
    cell(log.scores.sleep),
    cell(log.sleep.recoveryFeeling),
    cell(log.scores.food),
    cell(log.scores.phone),
    cell(log.scores.result),
    cell(log.scores.total),
    cell(log.scores.recordingRate),
    cell(log.result.focusMinutes),
    log.result.achievementText,
    cell(log.aiInsight?.achievementScore),
    cell(log.result.confirmedAchievementScore),
    cell(log.result.reflectionRating),
    log.result.comment,
    log.aiInsight?.nextExperiment ?? "",
    log.scoreVersion,
    JSON.stringify(log),
    log.createdAt,
    log.updatedAt,
  ];
}

function mealRow(date: string, meal: MealInput) {
  const mealScore = calculateMealPoints(meal);
  return [
    `${date}-${meal.type}`,
    USER_KEY,
    date,
    meal.type,
    cell(meal.eatenAt),
    cell(meal.carbohydrateLevel),
    cell(meal.proteinLevel),
    cell(meal.vegetableLevel),
    cell(meal.portionLevel),
    cell(meal.drinkType),
    JSON.stringify(meal.features),
    cell(meal.walkMinutes),
    cell(meal.postMealSleepiness),
    cell(mealScore),
    "rule",
    new Date().toISOString(),
  ];
}

function snackRow(date: string, snack: SnackInput, snackId: string) {
  return [
    snackId,
    USER_KEY,
    date,
    cell(snack.eatenAt),
    cell(snack.occurred),
    cell(snack.category),
    cell(snack.amountLevel),
    cell(snack.planned),
    cell(snack.beforeBed),
    cell(calculateSnackItemPoints(snack)),
    snack.note,
    new Date().toISOString(),
    new Date().toISOString(),
  ];
}

function parsePayload(value: string | undefined): DailyLog | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as DailyLog;
  } catch {
    return null;
  }
}

function numberOrNull(value: string | undefined) {
  if (!value) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function columnName(length: number) {
  let result = "";
  let value = length;
  while (value > 0) {
    const remainder = (value - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    value = Math.floor((value - 1) / 26);
  }
  return result;
}
