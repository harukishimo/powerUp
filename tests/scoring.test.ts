import { describe, expect, it } from "vitest";
import {
  calculateAchievementPoints,
  calculateEstimatedPerformance,
  calculateFocusPoints,
  calculateFoodPoints,
  calculateMealPoints,
  calculateMinutesUntilNextCommitment,
  calculateNapPerformanceEffect,
  calculatePhonePoints,
  calculateReflectionPoints,
  calculateSnackItemPoints,
  calculateSnackPoints,
  calculateSleepPoints,
  calculateScores,
  calculateTimingPoints,
  ESTIMATE_VERSION,
  SCORE_VERSION,
} from "@/lib/scoring";
import type { DailyLogInput, MealInput } from "@/types/domain";
import { MemoryStorage } from "@/lib/storage";
import { AiInsightSchema, DailyLogInputSchema } from "@/lib/validation";
import { fallbackAiScore } from "@/lib/gemini";
import { formatJstIso, formatJstTime, isValidDateString, normalizeTimelineEvents } from "@/lib/date";
import { buildWeeklyTrend } from "@/lib/trend";

const blankMeal = (type: MealInput["type"]): MealInput => ({
  type,
  eatenAt: null,
  carbohydrateLevel: null,
  proteinLevel: null,
  vegetableLevel: null,
  portionLevel: null,
  drinkType: null,
  features: ["normal"],
  walkMinutes: null,
  postMealSleepiness: null,
});

const emptyLog = (): DailyLogInput => ({
  date: "2026-07-29",
  sleep: { pixelWatchScore: null, recoveryFeeling: null },
  mealTiming: { regular: null, dinnerBeforeBed: null, noLongGap: null },
  meals: [],
  snacks: [],
  snackRecorded: false,
  phone: { entertainmentMinutes: null, separatedDuringWork: null, limitedMorningOrNightUse: null },
  result: { achievementText: "", focusMinutes: null, reflectionRating: null, comment: "", confirmedAchievementScore: null },
  scoreVersion: SCORE_VERSION,
});

const completeMeal = (type: MealInput["type"]): MealInput => ({
  ...blankMeal(type),
  eatenAt: type === "breakfast" ? "08:00" : type === "lunch" ? "12:00" : "19:00",
  carbohydrateLevel: "sufficient",
  proteinLevel: "sufficient",
  vegetableLevel: "sufficient",
  portionLevel: "just-right",
  drinkType: "water-tea",
  walkMinutes: 10,
});

describe("scoring v2", () => {
  it("combines a wearable sleep score with a small recovery-feeling adjustment", () => {
    expect(calculateSleepPoints(82)).toBe(25);
    expect(calculateSleepPoints(82, 4)).toBe(24);
    expect(calculateSleepPoints(66, 1)).toBe(17);
    expect(calculateSleepPoints(66, 5)).toBe(21);
    expect(calculateSleepPoints(100, 5)).toBe(30);
    expect(calculateSleepPoints(null, 5)).toBeNull();
  });

  it("weights performance outcomes continuously on a 100-point scale", () => {
    expect(calculateAchievementPoints(5)).toBe(55);
    expect(calculateFocusPoints(0)).toBe(0);
    expect(calculateFocusPoints(30)).toBe(10);
    expect(calculateFocusPoints(60)).toBe(20);
    expect(calculateFocusPoints(90)).toBe(30);
    expect(calculateFocusPoints(180)).toBe(30);
    expect(calculateReflectionPoints(1)).toBe(0);
    expect(calculateReflectionPoints(3)).toBe(8);
    expect(calculateReflectionPoints(5)).toBe(15);
  });

  it("calculates the next-commitment gap from clock times", () => {
    expect(calculateMinutesUntilNextCommitment("14:30", "15:15")).toBe(45);
    expect(calculateMinutesUntilNextCommitment("23:50", "00:20")).toBe(30);
    expect(calculateMinutesUntilNextCommitment("14:30", null)).toBeNull();
    expect(calculateMinutesUntilNextCommitment(null, "15:15", 45)).toBe(45);
  });

  it("formats generated timestamps in JST and migrates legacy save events", () => {
    expect(formatJstTime("2026-07-30T00:00:00.000Z")).toBe("09:00");
    expect(formatJstIso("2026-07-30T00:00:00.000Z")).toBe("2026-07-30T09:00:00.000+09:00");

    const normalized = normalizeTimelineEvents("2026-07-30", [
      { time: "00:00", label: "日次ログを保存", detail: "legacy" },
      { time: "08:00", label: "睡眠を記録" },
    ]);

    expect(normalized[0]).toMatchObject({ time: "09:00", timeZone: "Asia/Tokyo" });
    expect(normalized[1]).toEqual({ time: "08:00", label: "睡眠を記録" });
    expect(normalizeTimelineEvents("2026-07-30", normalized)).toEqual(normalized);
  });

  it("keeps a completely empty log unscored", () => {
    const scores = calculateScores(emptyLog());
    expect(scores.total).toBeNull();
    expect(scores.result).toBeNull();
    expect(scores.recordingRate).toBe(0);
    expect(scores.sleep).toBeNull();
  });

  it("produces 100 only when all three performance outcomes are complete and maximal", () => {
    const input = emptyLog();
    input.result.confirmedAchievementScore = 5;
    input.result.focusMinutes = 90;
    input.result.reflectionRating = 5;

    const scores = calculateScores(input);

    expect(scores.result).toBe(100);
    expect(scores.total).toBe(100);
    expect(scores.recordingRate).toBe(100);
    expect(scores.provisional).toBe(false);
  });

  it("does not normalize a partial performance log", () => {
    const input = emptyLog();
    input.result.confirmedAchievementScore = 5;

    const scores = calculateScores(input);

    expect(scores.total).toBe(55);
    expect(scores.recordingRate).toBe(55);
    expect(scores.provisional).toBe(true);
  });

  it("does not mix condition scores into the performance total", () => {
    const input = emptyLog();
    input.sleep = { pixelWatchScore: 100, recoveryFeeling: 5 };
    input.meals = ["breakfast", "lunch", "dinner"].map((type) => completeMeal(type as MealInput["type"]));
    input.mealTiming = { regular: true, dinnerBeforeBed: true, noLongGap: true };
    input.snackRecorded = true;
    input.phone = { entertainmentMinutes: 60, separatedDuringWork: true, limitedMorningOrNightUse: true };

    const scores = calculateScores(input);

    expect(scores.sleep).toBe(30);
    expect(scores.food).toBe(20);
    expect(scores.phone).toBe(8);
    expect(scores.total).toBeNull();
    expect(scores.recordingRate).toBe(0);
  });

  it("estimates performance from available condition inputs without changing the actual score", () => {
    const input = emptyLog();
    input.sleep = { pixelWatchScore: 66, recoveryFeeling: 2 };
    input.performanceContext = {
      assessmentTime: "09:27",
      wakeTime: null,
      currentAlertness: null,
      continuousWorkMinutes: null,
      minutesUntilNextCommitment: null,
    };
    input.meals = [{
      ...blankMeal("breakfast"),
      eatenAt: "07:20",
      carbohydrateLevel: "small",
      proteinLevel: "sufficient",
      vegetableLevel: "none",
      portionLevel: "slightly-high",
      drinkType: "unsweetened",
      features: ["fried"],
      walkMinutes: 0,
      postMealSleepiness: 2,
    }];

    const estimate = calculateEstimatedPerformance(input);

    expect(estimate).toMatchObject({
      score: 53,
      coverage: 44,
      inputs: ["sleep", "food"],
      version: ESTIMATE_VERSION,
      asOf: "09:27",
    });
    expect(estimate.components.sleep).toMatchObject({ score: 56, coverage: 100, weight: 30 });
    expect(estimate.components.food).toMatchObject({ score: 62, coverage: 71, weight: 20 });
    expect(calculateScores(input).total).toBeNull();
  });

  it("reports zero estimate coverage for empty logs and full coverage for complete conditions", () => {
    expect(calculateEstimatedPerformance(emptyLog())).toMatchObject({
      score: null,
      coverage: 0,
      inputs: [],
      version: ESTIMATE_VERSION,
      asOf: null,
      interactionBonus: 0,
    });

    const input = emptyLog();
    input.sleep = { pixelWatchScore: 100, recoveryFeeling: 5 };
    input.performanceContext = {
      assessmentTime: "13:00",
      wakeTime: "06:30",
      currentAlertness: 5,
      continuousWorkMinutes: 45,
      nextCommitmentTime: "15:00",
    };
    input.meals = [
      { ...completeMeal("breakfast"), eatenAt: "10:00", postMealSleepiness: 1 },
      { ...completeMeal("lunch"), eatenAt: "12:00", postMealSleepiness: 1 },
      completeMeal("dinner"),
    ];
    input.mealTiming = { regular: true, dinnerBeforeBed: true, noLongGap: true };
    input.snackRecorded = true;
    input.snacks = [{
      id: "recent-snack",
      eatenAt: "12:30",
      occurred: true,
      category: "healthy-small",
      amountLevel: "small",
      planned: true,
      beforeBed: false,
      note: "",
    }];
    input.phone = {
      entertainmentMinutes: 60,
      separatedDuringWork: true,
      limitedMorningOrNightUse: true,
    };

    expect(calculateEstimatedPerformance(input)).toMatchObject({
      score: 98,
      coverage: 100,
      inputs: ["sleep", "wake", "alertness", "work", "food", "digital"],
      version: ESTIMATE_VERSION,
      asOf: "13:00",
    });
  });

  it("adds only a small, time-limited sleep and alertness interaction", () => {
    const input = emptyLog();
    input.sleep = { pixelWatchScore: 100, recoveryFeeling: null };
    input.performanceContext = {
      assessmentTime: "08:00",
      wakeTime: "06:00",
      currentAlertness: 5,
      continuousWorkMinutes: null,
      nextCommitmentTime: null,
    };

    const peak = calculateEstimatedPerformance(input);
    expect(peak).toMatchObject({
      score: 77,
      interactionBonus: 3,
    });
    expect(peak.reasons[0]).toContain("実験的に +3点");

    input.performanceContext.assessmentTime = "07:30";
    expect(calculateEstimatedPerformance(input).interactionBonus).toBe(1.5);

    input.performanceContext.assessmentTime = "10:00";
    expect(calculateEstimatedPerformance(input).interactionBonus).toBe(3);

    input.performanceContext.assessmentTime = "11:00";
    expect(calculateEstimatedPerformance(input).interactionBonus).toBe(1.5);

    input.performanceContext.assessmentTime = "12:00";
    expect(calculateEstimatedPerformance(input).interactionBonus).toBe(0);

    input.performanceContext.assessmentTime = "06:30";
    expect(calculateEstimatedPerformance(input).interactionBonus).toBe(0);
  });

  it("does not add sleep synergy without all required evidence or above its safe bounds", () => {
    const input = emptyLog();
    input.sleep = { pixelWatchScore: 75, recoveryFeeling: null };
    input.performanceContext = {
      assessmentTime: "08:00",
      wakeTime: "06:00",
      currentAlertness: 5,
      continuousWorkMinutes: null,
      nextCommitmentTime: null,
    };

    expect(calculateEstimatedPerformance(input).interactionBonus).toBe(0);

    input.sleep.pixelWatchScore = 100;
    input.performanceContext.currentAlertness = 3;
    expect(calculateEstimatedPerformance(input).interactionBonus).toBe(0);

    input.performanceContext.currentAlertness = 5;
    input.performanceContext.wakeTime = null;
    expect(calculateEstimatedPerformance(input).interactionBonus).toBe(0);

    input.performanceContext.wakeTime = "06:00";
    input.sleep.recoveryFeeling = 5;
    const capped = calculateEstimatedPerformance(input);
    expect(capped.interactionBonus).toBe(0);
    expect(capped.score).toBeLessThanOrEqual(100);
  });

  it("applies conservative nap inertia and benefit windows", () => {
    const input = emptyLog();
    const effect = (
      startedAt: string | null,
      endedAt: string | null,
      assessmentTime: string | null,
    ) => {
      input.nap = { startedAt, endedAt };
      input.performanceContext = {
        assessmentTime,
        wakeTime: null,
        currentAlertness: null,
        continuousWorkMinutes: null,
        nextCommitmentTime: null,
      };
      return calculateNapPerformanceEffect(input);
    };

    expect(effect("12:00", "12:09", "12:09").adjustment).toBe(0);
    expect(effect("12:00", "12:10", "12:10")).toMatchObject({ adjustment: -1, phase: "inertia" });
    expect(effect("12:00", "12:20", "14:49")).toMatchObject({ adjustment: 1, phase: "benefit" });
    expect(effect("12:00", "12:21", "12:21").adjustment).toBe(-2);
    expect(effect("12:00", "12:30", "13:05").adjustment).toBe(1);
    expect(effect("12:00", "12:31", "12:31").adjustment).toBe(-3);
    expect(effect("12:00", "13:00", "14:00").adjustment).toBe(1);
    expect(effect("12:00", "13:01", "13:01").adjustment).toBe(-4);
    expect(effect("12:00", "13:30", "17:29").adjustment).toBe(1);
    expect(effect("12:00", "13:30", "17:30")).toMatchObject({ adjustment: 0, phase: "expired" });
    expect(effect("12:00", "13:31", "13:31").adjustment).toBe(0);
    expect(effect(null, "12:20", "13:00").adjustment).toBe(0);
    expect(effect("13:00", "12:20", "13:00").adjustment).toBe(0);
    expect(effect("12:00", "12:20", "12:10").adjustment).toBe(0);
  });

  it("keeps nap adjustments out of the actual performance score", () => {
    const input = emptyLog();
    input.result = {
      achievementText: "重要な成果を完了",
      confirmedAchievementScore: 5,
      focusMinutes: 90,
      reflectionRating: 5,
      comment: "",
    };
    const before = calculateScores(input);
    input.nap = { startedAt: "12:00", endedAt: "13:01" };
    input.performanceContext = {
      assessmentTime: "13:01",
      wakeTime: null,
      currentAlertness: null,
      continuousWorkMinutes: null,
      nextCommitmentTime: null,
    };

    expect(calculateNapPerformanceEffect(input).adjustment).toBe(-4);
    expect(calculateScores(input)).toEqual(before);
  });

  it("applies the nap adjustment only to the current-condition estimate", () => {
    const input = emptyLog();
    input.sleep = { pixelWatchScore: 66, recoveryFeeling: 2 };
    input.performanceContext = {
      assessmentTime: "13:00",
      wakeTime: null,
      currentAlertness: null,
      continuousWorkMinutes: null,
      nextCommitmentTime: null,
    };
    const baseline = calculateEstimatedPerformance(input);

    input.nap = { startedAt: "12:00", endedAt: "12:20" };
    const benefited = calculateEstimatedPerformance(input);
    expect(benefited.score).toBe((baseline.score ?? 0) + 1);
    expect(benefited.napEffect).toMatchObject({ adjustment: 1, phase: "benefit" });

    input.nap = { startedAt: "11:59", endedAt: "13:00" };
    const inertia = calculateEstimatedPerformance(input);
    expect(inertia.score).toBe((baseline.score ?? 0) - 4);
    expect(inertia.napEffect).toMatchObject({ adjustment: -4, phase: "inertia" });
    expect(calculateScores(input).total).toBeNull();
  });

  it("prioritizes a recorded post-meal response over meal proxies", () => {
    const base = emptyLog();
    base.performanceContext = {
      assessmentTime: "13:00",
      wakeTime: null,
      currentAlertness: null,
      continuousWorkMinutes: null,
      minutesUntilNextCommitment: null,
    };
    const favorable = {
      ...completeMeal("lunch"),
      eatenAt: "12:00",
      postMealSleepiness: 5,
    };
    const unfavorable: MealInput = {
      ...favorable,
      carbohydrateLevel: "large",
      proteinLevel: "none",
      vegetableLevel: "none",
      portionLevel: "overeating",
      drinkType: "sweet",
      features: ["fried", "double-staple"],
      walkMinutes: 0,
    };

    const favorableEstimate = calculateEstimatedPerformance({ ...base, meals: [favorable] });
    const unfavorableEstimate = calculateEstimatedPerformance({ ...base, meals: [unfavorable] });

    expect(favorableEstimate.components.food).toEqual(unfavorableEstimate.components.food);
    expect(favorableEstimate.score).toBe(unfavorableEstimate.score);
  });

  it("ignores future meals and meals older than four hours in the current estimate", () => {
    const input = emptyLog();
    input.performanceContext = {
      assessmentTime: "13:00",
      wakeTime: null,
      currentAlertness: null,
      continuousWorkMinutes: null,
      minutesUntilNextCommitment: null,
    };
    input.meals = [
      { ...completeMeal("breakfast"), eatenAt: "08:00", postMealSleepiness: 5 },
      { ...completeMeal("dinner"), eatenAt: "19:00", postMealSleepiness: 5 },
    ];

    const estimate = calculateEstimatedPerformance(input);

    expect(estimate.components.food).toMatchObject({ score: null, coverage: 0 });
    expect(estimate.score).toBeNull();
  });

  it("uses partial digital evidence without treating missing items as zero", () => {
    const input = emptyLog();
    input.phone.separatedDuringWork = true;

    const estimate = calculateEstimatedPerformance(input);

    expect(estimate.components.digital).toEqual({
      score: 100,
      effectiveScore: 80,
      coverage: 60,
      weight: 15,
    });
    expect(estimate).toMatchObject({
      score: 55,
      coverage: 9,
      inputs: ["digital"],
    });
  });

  it("keeps actual performance inputs out of the current-condition estimate", () => {
    const input = emptyLog();
    input.sleep = { pixelWatchScore: 80, recoveryFeeling: 4 };
    const before = calculateEstimatedPerformance(input);
    input.result = {
      achievementText: "重要な成果を完了",
      confirmedAchievementScore: 5,
      focusMinutes: 90,
      reflectionRating: 5,
      comment: "",
    };

    expect(calculateEstimatedPerformance(input)).toEqual(before);
    expect(calculateScores(input).total).toBe(100);
  });

  it("scores explicit meal behavior without rewarding missing fields", () => {
    expect(calculateMealPoints(completeMeal("breakfast"))).toBe(5);
    expect(calculateMealPoints(blankMeal("breakfast"))).toBeNull();
    expect(calculateMealPoints({ ...blankMeal("breakfast"), drinkType: "water-tea" })).toBe(1);
    expect(calculateMealPoints({ ...blankMeal("breakfast"), drinkType: "sweet" })).toBe(0);
  });

  it("caps complete food behavior at 20 points", () => {
    const input = emptyLog();
    input.meals = [
      completeMeal("breakfast"),
      completeMeal("lunch"),
      completeMeal("dinner"),
    ];
    input.mealTiming = { regular: true, dinnerBeforeBed: true, noLongGap: true };
    input.snackRecorded = true;

    expect(calculateSnackPoints([], true)).toBe(1);
    expect(calculateSnackPoints([{ id: "snack-1", eatenAt: "22:00", occurred: true, category: "large-or-late", amountLevel: "large", planned: false, beforeBed: true, note: "" }], true)).toBe(0);
    expect(calculateFoodPoints(input)).toBe(20);
  });

  it("keeps incomplete meal-timing and snack context unscored", () => {
    expect(calculateTimingPoints({ regular: null, dinnerBeforeBed: null, noLongGap: null })).toBeNull();
    expect(calculateTimingPoints({ regular: true, dinnerBeforeBed: null, noLongGap: null })).toBeNull();
    expect(calculateTimingPoints({ regular: true, dinnerBeforeBed: false, noLongGap: true })).toBe(1);

    const snack = {
      id: "snack-1",
      eatenAt: "15:00",
      occurred: true,
      category: "healthy-small" as const,
      amountLevel: "small" as const,
      planned: null,
      beforeBed: null,
      note: "",
    };
    expect(calculateSnackItemPoints(snack)).toBeNull();
    expect(calculateSnackItemPoints({ ...snack, beforeBed: false })).toBe(1);
    expect(calculateSnackItemPoints({ ...snack, beforeBed: true })).toBe(0);
  });

  it("requires all digital-attention inputs instead of inventing screen time", () => {
    expect(calculatePhonePoints({ entertainmentMinutes: null, separatedDuringWork: true, limitedMorningOrNightUse: true })).toBeNull();
    expect(calculatePhonePoints({ entertainmentMinutes: 120, separatedDuringWork: true, limitedMorningOrNightUse: true })).toBe(8);
    expect(calculatePhonePoints({ entertainmentMinutes: 121, separatedDuringWork: true, limitedMorningOrNightUse: true })).toBe(7);
    expect(calculatePhonePoints({ entertainmentMinutes: 240, separatedDuringWork: false, limitedMorningOrNightUse: true })).toBe(3);
    expect(calculatePhonePoints({ entertainmentMinutes: 241, separatedDuringWork: false, limitedMorningOrNightUse: false })).toBe(0);
  });

  it("preserves recorded zeroes and distinguishes them from missing values", () => {
    const input = emptyLog();
    input.sleep.pixelWatchScore = 0;
    input.result.confirmedAchievementScore = 0;
    expect(calculateScores(input).sleep).toBe(0);
    expect(calculateScores(input).total).toBe(0);
    expect(calculateScores(emptyLog()).sleep).toBeNull();
    expect(calculateScores(emptyLog()).total).toBeNull();
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

    const third = await storage.upsert(input, scores, "request-2");
    expect(third.timeline).toHaveLength(2);
    expect(third.timeline.at(-1)?.detail).toBe("request-2");
  });

  it("validates dates and AI fallback output", () => {
    expect(isValidDateString("2026-07-29")).toBe(true);
    expect(isValidDateString("2026-02-30")).toBe(false);
    expect(() => DailyLogInputSchema.parse({ ...emptyLog(), date: "2026-02-30" })).toThrow();
    expect(() => DailyLogInputSchema.parse({
      ...emptyLog(),
      performanceContext: {
        assessmentTime: "25:00",
        wakeTime: "07:00",
        currentAlertness: 3,
        continuousWorkMinutes: 45,
        minutesUntilNextCommitment: 30,
      },
    })).toThrow();
    expect(AiInsightSchema.parse(fallbackAiScore({ date: "2026-07-29", achievementText: "短い成果", reflectionRating: 3, focusMinutes: 30, foodSummary: {}, deterministicScores: { sleep: null, food: null, phone: null } }))).toMatchObject({ confidence: "low" });
  });

  it("highlights the actual latest weekday in the weekly trend", () => {
    const trend = buildWeeklyTrend([], "2026-07-30");
    expect(trend.map((item) => item.label)).toEqual(["金", "土", "日", "月", "火", "水", "木"]);
    expect(trend.every((item) => item.value === null)).toBe(true);
    expect(trend.filter((item) => item.today)).toHaveLength(1);
    expect(trend[6]?.today).toBe(true);
  });
});
