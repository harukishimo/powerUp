import { describe, expect, it } from "vitest";
import {
  calculateFocusPoints,
  calculateFoodPoints,
  calculateMealPoints,
  calculateReflectionPoints,
  calculateSnackPoints,
  calculateSleepPoints,
  calculateScores,
} from "@/lib/scoring";
import type { DailyLogInput } from "@/types/domain";
import { MemoryStorage } from "@/lib/storage";
import { AiInsightSchema, DailyLogInputSchema } from "@/lib/validation";
import { fallbackAiScore } from "@/lib/gemini";
import { isValidDateString } from "@/lib/date";
import { buildWeeklyTrend } from "@/lib/trend";

const emptyLog = (): DailyLogInput => ({
  date: "2026-07-29",
  sleep: { pixelWatchScore: null, recoveryFeeling: null },
  mealTiming: { regular: null, dinnerBeforeBed: null, noLongGap: null },
  meals: [],
  snacks: [],
  snackRecorded: false,
  phone: { entertainmentMinutes: null, separatedDuringWork: null, limitedMorningOrNightUse: null },
  result: { achievementText: "", focusMinutes: null, reflectionRating: null, comment: "", confirmedAchievementScore: null },
  scoreVersion: "v1",
});

describe("scoring", () => {
  it("converts Pixel Watch sleep score to 50 points", () => {
    expect(calculateSleepPoints(82)).toBe(41);
    expect(calculateSleepPoints(100)).toBe(50);
    expect(calculateSleepPoints(null)).toBeNull();
  });

  it("maps focus time boundaries", () => {
    expect(calculateFocusPoints(29)).toBe(0);
    expect(calculateFocusPoints(30)).toBe(1);
    expect(calculateFocusPoints(60)).toBe(2);
    expect(calculateFocusPoints(90)).toBe(3);
  });

  it("maps reflection rating", () => {
    expect(calculateReflectionPoints(1)).toBe(0);
    expect(calculateReflectionPoints(3)).toBe(1);
    expect(calculateReflectionPoints(5)).toBe(2);
  });

  it("does not turn missing categories into zero points", () => {
    const result = calculateScores(emptyLog());
    expect(result.total).toBeNull();
    expect(result.recordingRate).toBe(0);
    expect(result.sleep).toBeNull();
  });

  it("keeps partial logs on the fixed 100-point scale", () => {
    const input = emptyLog();
    input.sleep.pixelWatchScore = 82;
    input.phone.entertainmentMinutes = 60;
    input.phone.separatedDuringWork = true;
    input.phone.limitedMorningOrNightUse = true;
    input.result.confirmedAchievementScore = 5;
    input.result.focusMinutes = 90;
    input.result.reflectionRating = 5;
    const partial = calculateScores(input);
    expect(partial.total).toBe(61);
    expect(partial.recordingRate).toBe(70);
  });

  it("does not inflate a sleep-only score to a 100-point percentage", () => {
    const input = emptyLog();
    input.sleep.pixelWatchScore = 66;

    const scores = calculateScores(input);

    expect(scores.sleep).toBe(33);
    expect(scores.total).toBe(33);
    expect(scores.recordingRate).toBe(50);
    expect(scores.provisional).toBe(true);
  });

  it("scores meals, snacks, and timing within their fixed caps", () => {
    const completeMeal = {
      type: "breakfast" as const,
      eatenAt: "08:00",
      carbohydrateLevel: "sufficient" as const,
      proteinLevel: "sufficient" as const,
      vegetableLevel: "sufficient" as const,
      portionLevel: "just-right" as const,
      drinkType: "water-tea" as const,
      features: ["normal" as const],
      walkMinutes: 10,
      postMealSleepiness: null,
    };
    expect(calculateMealPoints(completeMeal)).toBe(8);
    expect(calculateSnackPoints([], true)).toBe(3);
    expect(calculateSnackPoints([{ id: "snack-1", eatenAt: "22:00", occurred: true, category: "large-or-late", amountLevel: "large", planned: false, beforeBed: true, note: "" }], true)).toBe(0);
    const input = emptyLog();
    input.meals = [completeMeal];
    input.mealTiming = { regular: true, dinnerBeforeBed: true, noLongGap: true };
    input.snackRecorded = true;
    expect(calculateFoodPoints(input)).toBe(14);
  });

  it("preserves missing values and distinguishes them from zero", () => {
    expect(calculateMealPoints({ ...emptyLog().meals[0]!, type: "breakfast" })).toBeNull();
    const input = emptyLog();
    input.sleep.pixelWatchScore = 0;
    expect(calculateScores(input).sleep).toBe(0);
    expect(calculateScores(emptyLog()).sleep).toBeNull();
  });

  it("keeps one memory row for the same client request id", async () => {
    const storage = new MemoryStorage();
    const input = emptyLog();
    input.date = "2099-01-01";
    const scores = calculateScores(input);
    const first = await storage.upsert(input, scores, "request-1");
    const second = await storage.upsert({ ...input, result: { ...input.result, comment: "再送" } }, scores, "request-1");
    expect(second).toEqual(first);
    expect((await storage.list(input.date, input.date)).filter((item) => item.date === input.date)).toHaveLength(1);
  });

  it("validates dates and AI fallback output", () => {
    expect(isValidDateString("2026-07-29")).toBe(true);
    expect(isValidDateString("2026-02-30")).toBe(false);
    expect(() => DailyLogInputSchema.parse({ ...emptyLog(), date: "2026-02-30" })).toThrow();
    expect(AiInsightSchema.parse(fallbackAiScore({ date: "2026-07-29", achievementText: "短い成果", reflectionRating: 3, focusMinutes: 30, foodSummary: {}, deterministicScores: { sleep: null, food: null, phone: null } }))).toMatchObject({ confidence: "low" });
  });

  it("highlights the actual latest weekday in the weekly trend", () => {
    const trend = buildWeeklyTrend([], "2026-07-30");
    expect(trend.map((item) => item.label)).toEqual(["金", "土", "日", "月", "火", "水", "木"]);
    expect(trend.filter((item) => item.today)).toHaveLength(1);
    expect(trend[6]?.today).toBe(true);
  });
});
