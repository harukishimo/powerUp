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

export const ESTIMATE_VERSION = "current-condition-v3";

export const SLEEP_ALERTNESS_INTERACTION_MAX = 3;

export const ESTIMATED_PERFORMANCE_WEIGHTS = {
  sleep: 30,
  wake: 10,
  alertness: 15,
  work: 10,
  food: 20,
  digital: 15,
} as const;

export type EstimateInput = keyof typeof ESTIMATED_PERFORMANCE_WEIGHTS;

export interface EstimateComponent {
  score: number | null;
  effectiveScore: number;
  coverage: number;
  weight: number;
}

export interface EstimatedPerformance {
  score: number | null;
  coverage: number;
  inputs: EstimateInput[];
  version: typeof ESTIMATE_VERSION;
  asOf: string | null;
  interactionBonus: number;
  components: Record<EstimateInput, EstimateComponent>;
  reasons: string[];
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

function timeToMinutes(value: string | null | undefined): number | null {
  if (!value || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return null;
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

/**
 * 評価時刻から、次の予定までの分数を算出する。
 * 日付は入力させず、評価時刻より前の時刻は翌日の予定として扱う。
 * 旧形式の分数は、時刻から算出できない保存データに限って使う。
 */
export function calculateMinutesUntilNextCommitment(
  assessmentTime: string | null | undefined,
  nextCommitmentTime: string | null | undefined,
  legacyMinutes: number | null | undefined = null,
): number | null {
  const assessment = timeToMinutes(assessmentTime);
  const next = timeToMinutes(nextCommitmentTime);
  if (assessment !== null && next !== null) {
    return (next - assessment + 1440) % 1440;
  }
  return legacyMinutes ?? null;
}

function interpolate(points: Array<[number, number]>, value: number) {
  if (value <= points[0][0]) return points[0][1];
  for (let index = 1; index < points.length; index += 1) {
    const [nextX, nextY] = points[index];
    const [previousX, previousY] = points[index - 1];
    if (value <= nextX) {
      const ratio = (value - previousX) / (nextX - previousX);
      return previousY + (nextY - previousY) * ratio;
    }
  }
  return points[points.length - 1][1];
}

function createEstimateComponent(
  score: number | null,
  coverage: number,
  weight: number,
): EstimateComponent {
  const normalizedCoverage = clamp(coverage, 0, 1);
  return {
    score: score === null ? null : round(clamp(score, 0, 100)),
    effectiveScore:
      score === null ? 50 : round(50 + normalizedCoverage * (clamp(score, 0, 100) - 50)),
    coverage: round(normalizedCoverage * 100),
    weight,
  };
}

function sleepEstimate(input: DailyLogInput, reasons: string[]) {
  const values: Array<[number | null, number]> = [
    [input.sleep.pixelWatchScore, 0.75],
    [
      input.sleep.recoveryFeeling === null
        ? null
        : ((input.sleep.recoveryFeeling - 1) / 4) * 100,
      0.25,
    ],
  ];
  const recorded = values.filter(([value]) => value !== null);
  if (recorded.length === 0) {
    return createEstimateComponent(null, 0, ESTIMATED_PERFORMANCE_WEIGHTS.sleep);
  }
  const recordedWeight = recorded.reduce((total, [, weight]) => total + weight, 0);
  const score =
    recorded.reduce((total, [value, weight]) => total + (value ?? 0) * weight, 0) /
    recordedWeight;
  if (input.sleep.recoveryFeeling !== null) {
    reasons.push(`朝の回復感 ${input.sleep.recoveryFeeling}/5 を反映`);
  }
  return createEstimateComponent(
    score,
    recordedWeight,
    ESTIMATED_PERFORMANCE_WEIGHTS.sleep,
  );
}

function wakeEstimate(input: DailyLogInput, reasons: string[]) {
  const assessment = timeToMinutes(input.performanceContext?.assessmentTime);
  const wake = timeToMinutes(input.performanceContext?.wakeTime);
  if (assessment === null || wake === null) {
    return createEstimateComponent(null, 0, ESTIMATED_PERFORMANCE_WEIGHTS.wake);
  }
  const minutesAwake = assessment >= wake ? assessment - wake : assessment + 1440 - wake;
  const score = interpolate([
    [0, 55],
    [30, 75],
    [60, 90],
    [120, 100],
    [600, 100],
    [840, 85],
    [1020, 55],
    [1200, 30],
  ], minutesAwake);
  if (minutesAwake < 120) reasons.push("起床後2時間以内の睡眠慣性を反映");
  if (minutesAwake > 840) reasons.push("長時間の連続覚醒を反映");
  return createEstimateComponent(
    score,
    1,
    ESTIMATED_PERFORMANCE_WEIGHTS.wake,
  );
}

function alertnessEstimate(input: DailyLogInput, reasons: string[]) {
  const alertness = input.performanceContext?.currentAlertness ?? null;
  if (alertness === null) {
    return createEstimateComponent(null, 0, ESTIMATED_PERFORMANCE_WEIGHTS.alertness);
  }
  reasons.push(`現在の覚醒感 ${alertness}/5 を反映`);
  return createEstimateComponent(
    alertness * 20,
    1,
    ESTIMATED_PERFORMANCE_WEIGHTS.alertness,
  );
}

function workContextEstimate(input: DailyLogInput, reasons: string[]) {
  const values: Array<[number, number]> = [];
  const assessment = input.performanceContext?.assessmentTime;
  const continuousWork = input.performanceContext?.continuousWorkMinutes ?? null;
  const untilNextCommitment =
    calculateMinutesUntilNextCommitment(
      assessment,
      input.performanceContext?.nextCommitmentTime,
      input.performanceContext?.minutesUntilNextCommitment,
    );

  if (continuousWork !== null) {
    values.push([
      interpolate([
        [0, 100],
        [60, 100],
        [90, 85],
        [120, 70],
        [240, 50],
      ], continuousWork),
      0.6,
    ]);
    if (continuousWork > 90) reasons.push("長い連続作業時間を予定適合度へ反映");
  }
  if (untilNextCommitment !== null) {
    values.push([
      interpolate([
        [0, 20],
        [15, 40],
        [30, 65],
        [60, 85],
        [90, 100],
        [1440, 100],
      ], untilNextCommitment),
      0.4,
    ]);
    if (untilNextCommitment < 30) reasons.push("次の予定までの短い空き時間を反映");
  }
  const recordedWeight = values.reduce((total, [, weight]) => total + weight, 0);
  if (recordedWeight === 0) {
    return createEstimateComponent(null, 0, ESTIMATED_PERFORMANCE_WEIGHTS.work);
  }
  return createEstimateComponent(
    values.reduce((total, [value, weight]) => total + value * weight, 0) /
      recordedWeight,
    recordedWeight,
    ESTIMATED_PERFORMANCE_WEIGHTS.work,
  );
}

function mealKernel(minutesSinceMeal: number) {
  if (minutesSinceMeal < 0 || minutesSinceMeal >= 240) return 0;
  if (minutesSinceMeal < 30) return minutesSinceMeal / 30;
  if (minutesSinceMeal <= 120) return 1;
  return (240 - minutesSinceMeal) / 120;
}

function snackKernel(minutesSinceSnack: number) {
  if (minutesSinceSnack < 0 || minutesSinceSnack >= 180) return 0;
  if (minutesSinceSnack < 20) return minutesSinceSnack / 20;
  if (minutesSinceSnack <= 90) return 1;
  return (180 - minutesSinceSnack) / 90;
}

function mealProxy(meal: MealInput) {
  let proxy = 0;
  let recorded = 0;

  if (meal.portionLevel !== null) {
    recorded += 1;
    if (meal.portionLevel === "slightly-high") proxy -= 0.2;
    if (meal.portionLevel === "overeating") proxy -= 0.45;
  }
  if (meal.carbohydrateLevel !== null || meal.features.includes("double-staple")) {
    recorded += 1;
    if (meal.carbohydrateLevel === "large" || meal.features.includes("double-staple")) {
      proxy -= 0.25;
    }
  }
  let balanceRisk = 0;
  if (meal.proteinLevel !== null) {
    recorded += 1;
    if (meal.proteinLevel === "small") balanceRisk -= 0.05;
    if (meal.proteinLevel === "none") balanceRisk -= 0.1;
  }
  if (meal.vegetableLevel !== null) {
    recorded += 1;
    if (meal.vegetableLevel === "small") balanceRisk -= 0.05;
    if (meal.vegetableLevel === "none") balanceRisk -= 0.1;
  }
  proxy += Math.max(-0.15, balanceRisk);
  if (meal.drinkType !== null) {
    recorded += 1;
    if (meal.drinkType === "sweet") proxy -= 0.15;
  }
  const explicitFeatures = meal.features.filter((feature) => feature !== "normal");
  if (explicitFeatures.length > 0) {
    recorded += 1;
    if (meal.features.includes("fried")) proxy -= 0.15;
  }
  if (meal.walkMinutes !== null) {
    recorded += 1;
    proxy += 0.15 * Math.min(meal.walkMinutes / 10, 1);
  }

  return {
    proxy: clamp(proxy, -1, 0.15),
    evidenceRatio: clamp(recorded / 7, 0, 1),
  };
}

function snackRisk(snack: SnackInput) {
  if (!snack.occurred || snack.category === "healthy-small") return 0;
  if (snack.category === "planned-meal") return snack.amountLevel === "large" ? -0.2 : 0;
  if (snack.category === "sweet-only") {
    if (snack.amountLevel === "large") return -0.3;
    if (snack.amountLevel === "medium") return -0.2;
    return -0.1;
  }
  return -0.35;
}

function foodStateEstimate(input: DailyLogInput, reasons: string[]) {
  const assessment = timeToMinutes(input.performanceContext?.assessmentTime);
  let delta = 0;
  let coverage = 0;
  let hasEvidence = false;

  if (assessment !== null) {
    for (const meal of input.meals) {
      const eatenAt = timeToMinutes(meal.eatenAt);
      if (eatenAt === null) continue;
      const kernel = mealKernel(assessment - eatenAt);
      if (kernel === 0) continue;
      hasEvidence = true;
      if (meal.postMealSleepiness !== null) {
        const response = [0, 1, 0.5, 0, -0.5, -1][meal.postMealSleepiness] ?? 0;
        delta += kernel * 25 * response;
        coverage += kernel * 0.75;
        reasons.push(`${meal.type}の食後の眠気 ${meal.postMealSleepiness}/5 を優先`);
      } else {
        const proxy = mealProxy(meal);
        delta += kernel * 15 * proxy.proxy;
        coverage += kernel * 0.45 * proxy.evidenceRatio;
        if (meal.features.includes("noodle") || meal.features.includes("eating-out")) {
          reasons.push("麺類・外食は種類だけで減点せず、量と反応を優先");
        }
      }
    }

    for (const snack of input.snacks) {
      const eatenAt = timeToMinutes(snack.eatenAt);
      if (eatenAt === null) continue;
      const kernel = snackKernel(assessment - eatenAt);
      if (kernel === 0) continue;
      hasEvidence = true;
      delta += kernel * 12 * snackRisk(snack);
      coverage += kernel * 0.15;
    }
  }

  if (input.snackRecorded && input.snacks.length === 0) {
    hasEvidence = true;
    coverage += 0.05;
    reasons.push("間食なしは加点・減点せず中立として反映");
  }

  const timingValues = [
    input.mealTiming.regular,
    input.mealTiming.dinnerBeforeBed,
    input.mealTiming.noLongGap,
  ];
  for (const value of timingValues) {
    if (value === null) continue;
    hasEvidence = true;
    delta += value ? 1 : -1;
    coverage += 0.05;
  }

  if (!hasEvidence) {
    return createEstimateComponent(null, 0, ESTIMATED_PERFORMANCE_WEIGHTS.food);
  }
  return createEstimateComponent(
    clamp(50 + delta, 0, 100),
    coverage,
    ESTIMATED_PERFORMANCE_WEIGHTS.food,
  );
}

function digitalEstimate(input: DailyLogInput, reasons: string[]) {
  const values: Array<[number, number]> = [];
  if (input.phone.entertainmentMinutes !== null) {
    values.push([
      interpolate([
        [0, 100],
        [60, 100],
        [120, 85],
        [180, 65],
        [240, 40],
        [480, 20],
        [1440, 0],
      ], input.phone.entertainmentMinutes),
      0.25,
    ]);
  }
  if (input.phone.separatedDuringWork !== null) {
    values.push([input.phone.separatedDuringWork ? 100 : 60, 0.6]);
    reasons.push(
      input.phone.separatedDuringWork
        ? "作業中の通知・確認を抑えた"
        : "作業中の通知・確認による中断を反映",
    );
  }
  if (input.phone.limitedMorningOrNightUse !== null) {
    values.push([input.phone.limitedMorningOrNightUse ? 100 : 60, 0.15]);
  }
  const recordedWeight = values.reduce((total, [, weight]) => total + weight, 0);
  if (recordedWeight === 0) {
    return createEstimateComponent(null, 0, ESTIMATED_PERFORMANCE_WEIGHTS.digital);
  }
  const score =
    values.reduce((total, [value, weight]) => total + value * weight, 0) /
    recordedWeight;
  return createEstimateComponent(
    score,
    recordedWeight,
    ESTIMATED_PERFORMANCE_WEIGHTS.digital,
  );
}

function calculateSleepAlertnessInteractionBonus(
  input: DailyLogInput,
  components: Record<EstimateInput, EstimateComponent>,
) {
  const pixelWatchScore = input.sleep.pixelWatchScore;
  const alertness = input.performanceContext?.currentAlertness ?? null;
  const assessment = timeToMinutes(input.performanceContext?.assessmentTime);
  const wake = timeToMinutes(input.performanceContext?.wakeTime);
  if (
    pixelWatchScore === null
    || alertness === null
    || assessment === null
    || wake === null
  ) {
    return 0;
  }

  const minutesAwake = assessment >= wake ? assessment - wake : assessment + 1440 - wake;
  const sleepFactor = clamp((pixelWatchScore - 75) / 25, 0, 1);
  const alertnessFactor = clamp((alertness - 3) / 2, 0, 1);
  const timingFactor =
    minutesAwake < 60 || minutesAwake >= 360
      ? 0
      : minutesAwake < 120
        ? (minutesAwake - 60) / 60
        : minutesAwake <= 240
          ? 1
          : (360 - minutesAwake) / 120;
  const rawBonus =
    SLEEP_ALERTNESS_INTERACTION_MAX * sleepFactor * alertnessFactor * timingFactor;
  const currentSleepAlertnessContribution =
    components.sleep.effectiveScore * (components.sleep.weight / 100)
    + components.alertness.effectiveScore * (components.alertness.weight / 100);
  const componentHeadroom = Math.max(
    0,
    ESTIMATED_PERFORMANCE_WEIGHTS.sleep
      + ESTIMATED_PERFORMANCE_WEIGHTS.alertness
      - currentSleepAlertnessContribution,
  );

  return Math.round(
    Math.min(rawBonus, componentHeadroom, SLEEP_ALERTNESS_INTERACTION_MAX) * 10,
  ) / 10;
}

export function calculateEstimatedPerformance(input: DailyLogInput): EstimatedPerformance {
  const reasons: string[] = [];
  const components: Record<EstimateInput, EstimateComponent> = {
    sleep: sleepEstimate(input, reasons),
    wake: wakeEstimate(input, reasons),
    alertness: alertnessEstimate(input, reasons),
    work: workContextEstimate(input, reasons),
    food: foodStateEstimate(input, reasons),
    digital: digitalEstimate(input, reasons),
  };
  const entries = Object.entries(components) as Array<[EstimateInput, EstimateComponent]>;
  const hasEvidence = entries.some(([, component]) => component.score !== null);
  const baseScore = hasEvidence
    ? entries.reduce(
        (total, [, component]) => total + component.effectiveScore * component.weight,
        0,
      ) / 100
    : null;
  const interactionBonus =
    baseScore === null ? 0 : calculateSleepAlertnessInteractionBonus(input, components);
  const score =
    baseScore === null ? null : round(clamp(baseScore + interactionBonus, 0, 100));
  if (interactionBonus > 0) {
    reasons.unshift(
      `良好な睡眠・高い覚醒感・起床後時間の一致を実験的に +${interactionBonus}点`,
    );
  }

  return {
    score,
    coverage: round(
      entries.reduce(
        (total, [, component]) => total + component.weight * (component.coverage / 100),
        0,
      ),
    ),
    inputs: entries
      .filter(([, component]) => component.score !== null)
      .map(([key]) => key),
    version: ESTIMATE_VERSION,
    asOf: input.performanceContext?.assessmentTime ?? null,
    interactionBonus,
    components,
    reasons: [...new Set(reasons)].slice(0, 4),
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
