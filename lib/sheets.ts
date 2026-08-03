import { google, sheets_v4 } from "googleapis";
import { config } from "@/lib/config";
import { formatJstTime, JAPAN_TIME_ZONE, normalizeLogTimestamps, nowJstIso } from "@/lib/date";
import {
  calculateAchievementPoints,
  calculateEstimatedPerformance,
  calculateFocusPoints,
  calculateMealPoints,
  calculateMinutesUntilNextCommitment,
  calculateReflectionPoints,
  calculateScores,
  calculateSnackItemPoints,
  SCORE_VERSION,
  SLEEP_ALERTNESS_INTERACTION_MAX,
} from "@/lib/scoring";
import { DailyLogInputSchema, HabitInputSchema } from "@/lib/validation";
import type { LogStorage } from "@/lib/storage-types";
import type { AiInsight, DailyLog, DailyLogInput, DailyLogSummary, Habit, HabitInput, HabitLog, MealInput, ScoreBreakdown, SnackInput } from "@/types/domain";

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
  "meal_timing_regular",
  "dinner_before_bed",
  "no_long_gap",
  "entertainment_minutes",
  "separated_during_work",
  "limited_morning_or_night_use",
  "achievement_points",
  "focus_points",
  "quality_points",
  "estimated_performance_score",
  "estimate_coverage",
  "estimate_version",
  "assessment_time",
  "next_commitment_time",
  "wake_time",
  "current_alertness",
  "continuous_work_minutes",
  "minutes_until_next_commitment",
  "estimate_components_json",
  "estimate_reasons_json",
  "nap_started_at",
  "nap_ended_at",
  "nap_adjustment",
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

const HABIT_HEADERS = [
  "habit_id",
  "user_key",
  "habit_name",
  "note",
  "color",
  "target_days",
  "active",
  "created_at",
  "updated_at",
];

const HABIT_LOG_HEADERS = [
  "log_key",
  "user_key",
  "habit_id",
  "log_date",
  "completed",
  "updated_at",
];

const USER_KEY = "default";

type SheetName = "daily_logs" | "meal_logs" | "snack_logs" | "ai_insights" | "habit_master" | "habit_logs";

const SHEET_HEADERS: Record<SheetName, string[]> = {
  daily_logs: DAILY_HEADERS,
  meal_logs: MEAL_HEADERS,
  snack_logs: SNACK_HEADERS,
  ai_insights: AI_HEADERS,
  habit_master: HABIT_HEADERS,
  habit_logs: HABIT_LOG_HEADERS,
};

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
      range: `${tab}!A:${columnName(SHEET_HEADERS[tab].length)}`,
      majorDimension: "ROWS",
    });
    return (response.data.values ?? []) as string[][];
  }

  private async ensureHeaders(tab: SheetName, headers: string[]) {
    const rows = await this.values(tab);
    if (rows.length > 0) {
      const actualHeaders = rows[0] ?? [];
      const missing = headers.filter((header) => !actualHeaders.includes(header));
      if (missing.length > 0) {
        const nextHeaders = [...actualHeaders, ...missing];
        await this.ensureColumnCapacity(tab, nextHeaders.length);
        await this.client.spreadsheets.values.update({
          spreadsheetId: config.spreadsheetId,
          range: `${tab}!${columnName(actualHeaders.length + 1)}1:${columnName(nextHeaders.length)}1`,
          valueInputOption: "RAW",
          requestBody: { values: [missing] },
        });
        rows[0] = nextHeaders;
      }
      return rows;
    }
    await this.ensureColumnCapacity(tab, headers.length);
    await this.client.spreadsheets.values.update({
      spreadsheetId: config.spreadsheetId,
      range: `${tab}!A1:${columnName(headers.length)}1`,
      valueInputOption: "RAW",
      requestBody: { values: [headers] },
    });
    return [headers];
  }

  private async ensureColumnCapacity(tab: SheetName, requiredColumns: number) {
    const spreadsheet = await this.client.spreadsheets.get({
      spreadsheetId: config.spreadsheetId,
      fields: "sheets.properties(sheetId,title,gridProperties.columnCount)",
    });
    const sheet = spreadsheet.data.sheets?.find((candidate) => candidate.properties?.title === tab);
    const sheetId = sheet?.properties?.sheetId;
    const columnCount = sheet?.properties?.gridProperties?.columnCount ?? 0;
    if (sheetId === undefined) throw new Error(`Google Sheets tab is not configured for ${tab}.`);
    if (columnCount >= requiredColumns) return;
    await this.client.spreadsheets.batchUpdate({
      spreadsheetId: config.spreadsheetId,
      requestBody: {
        requests: [{
          appendDimension: {
            sheetId,
            dimension: "COLUMNS",
            length: requiredColumns - columnCount,
          },
        }],
      },
    });
  }

  private async upsertRow(tab: SheetName, headers: string[], keyHeader: string, keyValue: string, row: string[]) {
    const rows = await this.ensureHeaders(tab, headers);
    const actualHeaders = rows[0] ?? headers;
    const rowByHeader = Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""]));
    const keyIndex = actualHeaders.indexOf(keyHeader);
    const rowIndex = rows.findIndex((candidate, index) => index > 0 && candidate[keyIndex] === keyValue);
    const existingRow = rowIndex >= 1 ? rows[rowIndex] ?? [] : [];
    const alignedRow = actualHeaders.map((header, index) =>
      Object.hasOwn(rowByHeader, header) ? rowByHeader[header] : existingRow[index] ?? "",
    );
    if (rowIndex >= 1) {
      const sheetRow = rowIndex + 1;
      await this.client.spreadsheets.values.update({
        spreadsheetId: config.spreadsheetId,
        range: `${tab}!A${sheetRow}:${columnName(alignedRow.length)}${sheetRow}`,
        valueInputOption: "RAW",
        requestBody: { values: [alignedRow] },
      });
    } else {
      await this.client.spreadsheets.values.append({
        spreadsheetId: config.spreadsheetId,
        range: `${tab}!A:${columnName(alignedRow.length)}`,
        valueInputOption: "RAW",
        insertDataOption: "INSERT_ROWS",
        requestBody: { values: [alignedRow] },
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
        const payload = refreshLog(parsePayload(row.payload_json));
        return {
          date: row.log_date,
          totalScore: payload?.scores.total ?? numberOrNull(row.total_score),
          recordingRate: payload?.scores.recordingRate ?? Number(row.recording_rate || 0),
          scores: {
            sleep: payload?.scores.sleep ?? numberOrNull(row.sleep_score),
            food: payload?.scores.food ?? numberOrNull(row.food_score),
            phone: payload?.scores.phone ?? numberOrNull(row.phone_score),
            result: payload?.scores.result ?? numberOrNull(row.result_score),
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
    return row ? refreshLog(parsePayload(row.payload_json)) : null;
  }

  async upsert(input: DailyLogInput, scores: ScoreBreakdown, clientRequestId: string): Promise<DailyLog> {
    const parsed = DailyLogInputSchema.parse({
      ...input,
      clientRequestId: input.clientRequestId ?? clientRequestId,
      snacks: input.snacks.map((snack, index) => ({ ...snack, id: snack.id ?? `${input.date}-snack-${index + 1}` })),
    });
    const existing = await this.get(parsed.date);
    if (existing?.clientRequestId === clientRequestId) return existing;
    const now = nowJstIso();
    const log: DailyLog = {
      ...parsed,
      id: existing?.id ?? `log-${parsed.date}`,
      status: parsed.aiInsight?.confirmed ? "confirmed" : "draft",
      scores,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      timeline: [...(existing?.timeline ?? []), { time: formatJstTime(now) ?? "—", label: "日次ログを保存", detail: clientRequestId, timeZone: JAPAN_TIME_ZONE }].slice(-12),
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
    const now = nowJstIso();
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
      SCORE_VERSION,
      cell(insight.achievementScore),
      insight.confidence,
      insight.reason,
      insight.nextExperiment,
      cell(confirmed),
      now,
    ]);
    return updated;
  }

  async listHabits(includeInactive = false): Promise<Habit[]> {
    const rows = await this.ensureHeaders("habit_master", HABIT_HEADERS);
    if (rows.length < 2) return [];
    const headers = rows[0] ?? HABIT_HEADERS;
    return rows
      .slice(1)
      .map((row) => rowToObject(headers, row))
      .filter((row) => row.user_key === USER_KEY && (includeInactive || booleanValue(row.active)))
      .map((row) => ({
        id: row.habit_id,
        name: row.habit_name,
        note: row.note,
        color: habitColor(row.color),
        targetDays: targetDays(row.target_days),
        active: booleanValue(row.active),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async upsertHabit(input: HabitInput, habitId?: string): Promise<Habit> {
    const parsed = HabitInputSchema.parse(input);
    const existing = habitId ? (await this.listHabits(true)).find((habit) => habit.id === habitId) : undefined;
    const now = nowJstIso();
    const habit: Habit = {
      ...parsed,
      id: existing?.id ?? habitId ?? `habit-${crypto.randomUUID()}`,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    await this.upsertRow("habit_master", HABIT_HEADERS, "habit_id", habit.id, [
      habit.id,
      USER_KEY,
      habit.name,
      habit.note,
      habit.color,
      JSON.stringify(habit.targetDays),
      cell(habit.active),
      habit.createdAt,
      habit.updatedAt,
    ]);
    return habit;
  }

  async listHabitLogs(from: string, to: string): Promise<HabitLog[]> {
    const rows = await this.ensureHeaders("habit_logs", HABIT_LOG_HEADERS);
    if (rows.length < 2) return [];
    const headers = rows[0] ?? HABIT_LOG_HEADERS;
    return rows
      .slice(1)
      .map((row) => rowToObject(headers, row))
      .filter((row) => row.user_key === USER_KEY && row.log_date >= from && row.log_date <= to)
      .map((row) => ({
        habitId: row.habit_id,
        date: row.log_date,
        completed: booleanValue(row.completed),
        updatedAt: row.updated_at,
      }))
      .sort((a, b) => a.date.localeCompare(b.date) || a.habitId.localeCompare(b.habitId));
  }

  async upsertHabitLog(habitId: string, date: string, completed: boolean): Promise<HabitLog> {
    const log: HabitLog = { habitId, date, completed, updatedAt: nowJstIso() };
    const key = `${habitId}:${date}`;
    await this.upsertRow("habit_logs", HABIT_LOG_HEADERS, "log_key", key, [
      key,
      USER_KEY,
      habitId,
      date,
      cell(completed),
      log.updatedAt,
    ]);
    return log;
  }
}

function dailyRow(log: DailyLog) {
  const estimate = calculateEstimatedPerformance(log);
  const minutesUntilNextCommitment = calculateMinutesUntilNextCommitment(
    log.performanceContext?.assessmentTime,
    log.performanceContext?.nextCommitmentTime,
    log.performanceContext?.minutesUntilNextCommitment,
  );
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
    cell(log.mealTiming.regular),
    cell(log.mealTiming.dinnerBeforeBed),
    cell(log.mealTiming.noLongGap),
    cell(log.phone.entertainmentMinutes),
    cell(log.phone.separatedDuringWork),
    cell(log.phone.limitedMorningOrNightUse),
    cell(calculateAchievementPoints(log.result.confirmedAchievementScore)),
    cell(calculateFocusPoints(log.result.focusMinutes)),
    cell(calculateReflectionPoints(log.result.reflectionRating)),
    cell(estimate.score),
    cell(estimate.coverage),
    estimate.version,
    cell(log.performanceContext?.assessmentTime),
    cell(log.performanceContext?.nextCommitmentTime),
    cell(log.performanceContext?.wakeTime),
    cell(log.performanceContext?.currentAlertness),
    cell(log.performanceContext?.continuousWorkMinutes),
    cell(minutesUntilNextCommitment),
    JSON.stringify({
      ...estimate.components,
      sleepAlertnessInteraction: {
        bonus: estimate.interactionBonus,
        max: SLEEP_ALERTNESS_INTERACTION_MAX,
        experimental: true,
      },
      napEffect: estimate.napEffect,
    }),
    JSON.stringify(estimate.reasons),
    cell(log.nap?.startedAt),
    cell(log.nap?.endedAt),
    cell(estimate.napEffect.adjustment),
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
    nowJstIso(),
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
    nowJstIso(),
    nowJstIso(),
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

function refreshLog(log: DailyLog | null): DailyLog | null {
  if (!log) return null;
  const normalized = normalizeLogTimestamps(log);
  const input: DailyLogInput = { ...normalized, scoreVersion: SCORE_VERSION };
  return {
    ...normalized,
    scoreVersion: SCORE_VERSION,
    scores: calculateScores(input),
  };
}

function numberOrNull(value: string | undefined) {
  if (!value) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function booleanValue(value: string | undefined) {
  return value === "true";
}

function targetDays(value: string | undefined) {
  if (!value) return [0, 1, 2, 3, 4, 5, 6];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (Array.isArray(parsed)) {
      const days = parsed.filter((day): day is number => Number.isInteger(day) && day >= 0 && day <= 6);
      if (days.length > 0) return [...new Set(days)].sort((a, b) => a - b);
    }
  } catch {
    // 旧データがカンマ区切りの場合は下の互換処理へ進む。
  }
  const days = value.split(",").map(Number).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6);
  return days.length > 0 ? [...new Set(days)].sort((a, b) => a - b) : [0, 1, 2, 3, 4, 5, 6];
}

function habitColor(value: string | undefined): Habit["color"] {
  return value === "mint" || value === "orange" || value === "rose" || value === "blue" ? value : "violet";
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
