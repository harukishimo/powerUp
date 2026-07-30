import type {
  DailyLogInput,
  FoodLevel,
  MealInput,
  MealTimingInput,
  PhoneInput,
  ResultInput,
  SnackInput,
} from "@/types/domain";

export const SCORE_VERSION = "v2";

export const SCORE_MAX = {
  sleep: 30,
  food: 20,
  phone: 8,
  result: 100,
  total: 100,
} as const;

export const PERFORMANCE_WEIGHTS = {
  achievement: 55,
  focus: 30,
  reflection: 15,
} as const;

export const ESTIMATE_VERSION = "condition-v1";

export const ESTIMATED_PERFORMANCE_WEIGHTS = {
  sleep: 40,
  food: 25,
  phone: 35,
} as const;

export type EstimateInput = keyof typeof ESTIMATED_PERFORMANCE_WEIGHTS;

export interface EstimatedPerformance {
  score: number | null;
  coverage: number;
  inputs: EstimateInput[];
  version: typeof ESTIMATE_VERSION;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const round = (value: number) => Math.round(value);

export function calculateSleepPoints(
  pixelWatchScore: number | null,
  recoveryFeeling: number | null = null,
): number | null {
  if (pixelWatchScore === null || pixelWatchScore === undefined) return null;
  const subjectiveScore =
    recoveryFeeling === null || recoveryFeeling === undefined
      ? pixelWatchScore
      : (recoveryFeeling - 1) * 25;
  const combinedSleepIndex = pixelWatchScore * 0.85 + subjectiveScore * 0.15;
  return clamp(round(combinedSleepIndex * (SCORE_MAX.sleep / 100)), 0, SCORE_MAX.sleep);
}

function levelPoints(level: FoodLevel | null, full: number, half: number): number | null {
  if (level === null) return null;
  if (level === "sufficient") return full;
  if (level === "small") return half;
  return 0;
}

function mealEvidence(meal: MealInput | null | undefined) {
  if (!meal) return { points: 0, recordedMax: 0 };

  const values: Array<[number | null, number]> = [
    [levelPoints(meal.vegetableLevel, 1.5, 0.75), 1.5],
    [levelPoints(meal.proteinLevel, 1, 0.5), 1],
    [
      meal.portionLevel === null
        ? null
        : meal.portionLevel === "just-right"
          ? 1
          : meal.portionLevel === "slightly-high"
            ? 0.5
            : 0,
      1,
    ],
    [meal.drinkType === null ? null : meal.drinkType === "sweet" ? 0 : 1, 1],
    [
      meal.carbohydrateLevel === null && !meal.features.includes("double-staple")
        ? null
        : meal.carbohydrateLevel === "large" || meal.features.includes("double-staple")
          ? 0
          : 0.5,
      0.5,
    ],
  ];
  const recorded = values.filter(([value]) => value !== null);
  return {
    points: recorded.reduce((total, [value]) => total + (value ?? 0), 0),
    recordedMax: recorded.reduce((total, [, max]) => total + max, 0),
  };
}

export function calculateMealPoints(meal: MealInput | null | undefined): number | null {
  const evidence = mealEvidence(meal);
  if (evidence.recordedMax === 0) return null;
  return clamp(evidence.points, 0, 5);
}

export function calculateTimingPoints(timing: MealTimingInput): number | null {
  const values: Array<[boolean | null, number]> = [
    [timing.regular, 0.5],
    [timing.dinnerBeforeBed, 1],
    [timing.noLongGap, 0.5],
  ];
  if (values.some(([value]) => value === null)) return null;
  return values.reduce((total, [value, points]) => total + (value === true ? points : 0), 0);
}

export function calculateSnackItemPoints(snack: SnackInput): number | null {
  if (!snack.occurred) return 1;
  if (snack.category === null || snack.amountLevel === null || snack.beforeBed === null) return null;
  if (snack.beforeBed === true || snack.category === "large-or-late") return 0;
  if (snack.category === "healthy-small") return snack.amountLevel === "large" ? 0.5 : 1;
  if (snack.category === "planned-meal") {
    if (snack.planned === null) return null;
    return snack.planned === true && snack.amountLevel !== "large" ? 1 : 0.5;
  }
  if (snack.category === "sweet-only") return snack.amountLevel === "small" ? 0.25 : 0;
  return 0;
}

export function calculateSnackPoints(snacks: SnackInput[], recorded: boolean): number | null {
  if (!recorded) return null;
  if (snacks.length === 0) return 1;
  const values = snacks.map(calculateSnackItemPoints);
  if (values.some((value) => value === null)) return null;
  return clamp(
    values.reduce<number>((total, value) => total + (value ?? 0), 0) / values.length,
    0,
    1,
  );
}

function foodEvidence(input: DailyLogInput) {
  const meals = (["breakfast", "lunch", "dinner"] as const).map((type) =>
    input.meals.find((meal) => meal.type === type),
  );
  const composition = meals.map(mealEvidence);
  const walk = meals.reduce(
    (evidence, meal) => {
      if (meal?.walkMinutes === null || meal?.walkMinutes === undefined) return evidence;
      return {
        points: evidence.points + Math.min(meal.walkMinutes / 10, 1) * (2 / 3),
        recordedMax: evidence.recordedMax + (2 / 3),
      };
    },
    { points: 0, recordedMax: 0 },
  );
  const timing = calculateTimingPoints(input.mealTiming);
  const snack = calculateSnackPoints(input.snacks, input.snackRecorded);
  return {
    points:
      composition.reduce((total, evidence) => total + evidence.points, 0) +
      walk.points +
      (timing ?? 0) +
      (snack ?? 0),
    recordedMax:
      composition.reduce((total, evidence) => total + evidence.recordedMax, 0) +
      walk.recordedMax +
      (timing === null ? 0 : 2) +
      (snack === null ? 0 : 1),
  };
}

export function calculateFoodPoints(input: DailyLogInput): number | null {
  const evidence = foodEvidence(input);
  if (evidence.recordedMax === 0) return null;
  return clamp(
    round(evidence.points),
    0,
    SCORE_MAX.food,
  );
}

export function calculatePhonePoints(phone: PhoneInput): number | null {
  if (
    phone.entertainmentMinutes === null ||
    phone.separatedDuringWork === null ||
    phone.limitedMorningOrNightUse === null
  ) {
    return null;
  }

  const usage =
    phone.entertainmentMinutes <= 120
      ? 3
      : phone.entertainmentMinutes <= 180
        ? 2
        : phone.entertainmentMinutes <= 240
          ? 1
          : 0;
  const interruptionControl = phone.separatedDuringWork ? 3 : 0;
  const morningOrNightBoundary = phone.limitedMorningOrNightUse ? 2 : 0;
  return clamp(usage + interruptionControl + morningOrNightBoundary, 0, SCORE_MAX.phone);
}

export function calculateAchievementPoints(score: number | null): number | null {
  if (score === null) return null;
  return clamp(round((score / 5) * PERFORMANCE_WEIGHTS.achievement), 0, PERFORMANCE_WEIGHTS.achievement);
}

export function calculateFocusPoints(focusMinutes: number | null): number | null {
  if (focusMinutes === null) return null;
  return clamp(
    round((Math.min(focusMinutes, 90) / 90) * PERFORMANCE_WEIGHTS.focus),
    0,
    PERFORMANCE_WEIGHTS.focus,
  );
}

export function calculateReflectionPoints(reflectionRating: number | null): number | null {
  if (reflectionRating === null) return null;
  return clamp(
    round(((reflectionRating - 1) / 4) * PERFORMANCE_WEIGHTS.reflection),
    0,
    PERFORMANCE_WEIGHTS.reflection,
  );
}

export function calculateResultPoints(result: ResultInput): number | null {
  const values = [
    calculateAchievementPoints(result.confirmedAchievementScore),
    calculateFocusPoints(result.focusMinutes),
    calculateReflectionPoints(result.reflectionRating),
  ];
  if (values.every((value) => value === null)) return null;
  return clamp(
    values.reduce<number>((total, value) => total + (value ?? 0), 0),
    0,
    SCORE_MAX.result,
  );
}

export function calculateEstimatedPerformance(input: DailyLogInput): EstimatedPerformance {
  const sleep = calculateSleepPoints(
    input.sleep.pixelWatchScore,
    input.sleep.recoveryFeeling,
  );
  const food = foodEvidence(input);
  const phone = calculatePhonePoints(input.phone);
  const candidates: Array<{
    key: EstimateInput;
    weight: number;
    normalizedScore: number | null;
    evidenceRatio: number;
  }> = [
    {
      key: "sleep",
      weight: ESTIMATED_PERFORMANCE_WEIGHTS.sleep,
      normalizedScore: sleep === null ? null : (sleep / SCORE_MAX.sleep) * 100,
      evidenceRatio: sleep === null ? 0 : 1,
    },
    {
      key: "food",
      weight: ESTIMATED_PERFORMANCE_WEIGHTS.food,
      normalizedScore:
        food.recordedMax === 0 ? null : (food.points / food.recordedMax) * 100,
      evidenceRatio: clamp(food.recordedMax / SCORE_MAX.food, 0, 1),
    },
    {
      key: "phone",
      weight: ESTIMATED_PERFORMANCE_WEIGHTS.phone,
      normalizedScore: phone === null ? null : (phone / SCORE_MAX.phone) * 100,
      evidenceRatio: phone === null ? 0 : 1,
    },
  ];
  const available = candidates.filter(
    (candidate): candidate is typeof candidate & { normalizedScore: number } =>
      candidate.normalizedScore !== null,
  );
  const availableWeight = available.reduce((total, candidate) => total + candidate.weight, 0);
  const score =
    availableWeight === 0
      ? null
      : clamp(
          round(
            available.reduce(
              (total, candidate) => total + candidate.normalizedScore * candidate.weight,
              0,
            ) / availableWeight,
          ),
          0,
          100,
        );

  return {
    score,
    coverage: clamp(
      round(
        candidates.reduce(
          (total, candidate) => total + candidate.weight * candidate.evidenceRatio,
          0,
        ),
      ),
      0,
      100,
    ),
    inputs: available.map((candidate) => candidate.key),
    version: ESTIMATE_VERSION,
  };
}

export function calculateScores(input: DailyLogInput) {
  const sleep = calculateSleepPoints(
    input.sleep.pixelWatchScore,
    input.sleep.recoveryFeeling,
  );
  const food = calculateFoodPoints(input);
  const phone = calculatePhonePoints(input.phone);
  const result = calculateResultPoints(input.result);
  const performanceParts: Array<[number | null, number]> = [
    [calculateAchievementPoints(input.result.confirmedAchievementScore), PERFORMANCE_WEIGHTS.achievement],
    [calculateFocusPoints(input.result.focusMinutes), PERFORMANCE_WEIGHTS.focus],
    [calculateReflectionPoints(input.result.reflectionRating), PERFORMANCE_WEIGHTS.reflection],
  ];
  const recorded = performanceParts.filter(([value]) => value !== null);
  const recordedMax = recorded.reduce((total, [, max]) => total + max, 0);
  const recordedPoints = result ?? 0;
  const recordingRate = recordedMax;

  return {
    sleep,
    food,
    phone,
    result,
    total: result,
    recordedPoints,
    recordedMax,
    recordingRate,
    provisional: recordedMax < SCORE_MAX.total,
  };
}
