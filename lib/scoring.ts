import type {
  DailyLogInput,
  FoodLevel,
  MealInput,
  MealTimingInput,
  PhoneInput,
  ResultInput,
  SnackInput,
} from "@/types/domain";

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const round = (value: number) => Math.round(value);

export function calculateSleepPoints(pixelWatchScore: number | null): number | null {
  if (pixelWatchScore === null || pixelWatchScore === undefined) return null;
  return clamp(round(pixelWatchScore * 0.5), 0, 50);
}

function foodLevelPoints(level: FoodLevel | null): number {
  if (level === "sufficient") return 1;
  if (level === "small") return 0.5;
  return 0;
}

export function calculateMealPoints(meal: MealInput | null | undefined): number | null {
  if (!meal) return null;
  const hasInput = [
    meal.carbohydrateLevel,
    meal.proteinLevel,
    meal.vegetableLevel,
    meal.portionLevel,
    meal.drinkType,
    meal.walkMinutes,
  ].some((value) => value !== null && value !== undefined);
  if (!hasInput) return null;

  const balance =
    foodLevelPoints(meal.carbohydrateLevel) +
    foodLevelPoints(meal.proteinLevel) +
    foodLevelPoints(meal.vegetableLevel);
  const portion =
    meal.portionLevel === "just-right" ? 2 : meal.portionLevel === "slightly-high" ? 1 : 0;
  const concerns = meal.features.filter((feature) => feature !== "normal").length;
  const content = meal.drinkType === "sweet" ? 0 : concerns >= 2 ? 0 : concerns === 1 ? 1 : 2;
  const walk = meal.walkMinutes !== null && meal.walkMinutes >= 10 ? 1 : 0;

  return clamp(round(balance + portion + content + walk), 0, 8);
}

export function calculateTimingPoints(timing: MealTimingInput): number | null {
  const values = [timing.regular, timing.dinnerBeforeBed, timing.noLongGap];
  if (values.every((value) => value === null)) return null;
  return values.reduce((total, value) => total + (value === true ? 1 : 0), 0);
}

export function calculateSnackItemPoints(snack: SnackInput): number {
  if (!snack.occurred) return 3;
  if (snack.category === "healthy-small") return snack.amountLevel === "large" ? 2 : 3;
  if (snack.category === "planned-meal") return snack.planned === true && snack.amountLevel !== "large" ? 3 : 2;
  if (snack.category === "sweet-only") return snack.amountLevel === "large" ? 0 : 1;
  if (snack.category === "large-or-late") return 0;
  return 1;
}

export function calculateSnackPoints(snacks: SnackInput[], recorded: boolean): number | null {
  if (!recorded) return null;
  if (snacks.length === 0) return 3;
  return clamp(round(snacks.reduce((total, snack) => total + calculateSnackItemPoints(snack), 0) / snacks.length), 0, 3);
}

export function calculateFoodPoints(input: DailyLogInput): number | null {
  const mealPoints = (["breakfast", "lunch", "dinner"] as const).map((type) =>
    calculateMealPoints(input.meals.find((meal) => meal.type === type)),
  );
  const timing = calculateTimingPoints(input.mealTiming);
  const snack = calculateSnackPoints(input.snacks, input.snackRecorded);
  const values = [...mealPoints, timing, snack];
  if (values.every((value) => value === null)) return null;
  return values.reduce<number>((total, value) => total + (value ?? 0), 0);
}

export function calculatePhonePoints(phone: PhoneInput): number | null {
  if (
    phone.entertainmentMinutes === null &&
    phone.separatedDuringWork === null &&
    phone.limitedMorningOrNightUse === null
  ) {
    return null;
  }

  const minutes = phone.entertainmentMinutes ?? 240;
  const usage = minutes <= 120 ? 7 : minutes <= 180 ? 5 : minutes <= 240 ? 3 : 1;
  const separation = phone.separatedDuringWork === true ? 2 : 0;
  const morningOrNight = phone.limitedMorningOrNightUse === true ? 1 : 0;
  return clamp(usage + separation + morningOrNight, 0, 10);
}

export function calculateFocusPoints(focusMinutes: number | null): number | null {
  if (focusMinutes === null) return null;
  if (focusMinutes >= 90) return 3;
  if (focusMinutes >= 60) return 2;
  if (focusMinutes >= 30) return 1;
  return 0;
}

export function calculateReflectionPoints(reflectionRating: number | null): number | null {
  if (reflectionRating === null) return null;
  return reflectionRating >= 4 ? 2 : reflectionRating === 3 ? 1 : 0;
}

export function calculateResultPoints(result: ResultInput): number | null {
  const achievement = result.confirmedAchievementScore;
  const focus = calculateFocusPoints(result.focusMinutes);
  const reflection = calculateReflectionPoints(result.reflectionRating);
  if (achievement === null && focus === null && reflection === null) return null;
  return clamp((achievement ?? 0) + (focus ?? 0) + (reflection ?? 0), 0, 10);
}

export function calculateScores(input: DailyLogInput) {
  const sleep = calculateSleepPoints(input.sleep.pixelWatchScore);
  const food = calculateFoodPoints(input);
  const phone = calculatePhonePoints(input.phone);
  const result = calculateResultPoints(input.result);
  const parts: Array<[number | null, number]> = [
    [sleep, 50],
    [food, 30],
    [phone, 10],
    [result, 10],
  ];
  const recorded = parts.filter(([value]) => value !== null);
  const recordedPoints = recorded.reduce((total, [value]) => total + (value ?? 0), 0);
  const recordedMax = recorded.reduce((total, [, max]) => total + max, 0);
  const recordingRate = recordedMax === 0 ? 0 : round((recordedMax / 100) * 100);
  const total = recordedMax === 0 ? null : round((recordedPoints / recordedMax) * 100);

  return {
    sleep,
    food,
    phone,
    result,
    total,
    recordedPoints,
    recordedMax,
    recordingRate,
    provisional: recordedMax < 100,
  };
}
