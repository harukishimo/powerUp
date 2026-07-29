export type MealType = "breakfast" | "lunch" | "dinner";
export type FoodLevel = "sufficient" | "small" | "none" | "large";
export type PortionLevel = "just-right" | "slightly-high" | "overeating";
export type DrinkType = "water-tea" | "unsweetened" | "sweet";
export type MealFeature = "normal" | "noodle" | "fried" | "eating-out" | "double-staple";
export type ScoreSource = "rule" | "ai" | "user";
export type LogStatus = "draft" | "proposed" | "confirmed";
export type Confidence = "low" | "medium" | "high";

export interface SleepInput {
  pixelWatchScore: number | null;
  recoveryFeeling: number | null;
}

export interface MealInput {
  id?: string;
  type: MealType;
  eatenAt: string | null;
  carbohydrateLevel: FoodLevel | null;
  proteinLevel: FoodLevel | null;
  vegetableLevel: FoodLevel | null;
  portionLevel: PortionLevel | null;
  drinkType: DrinkType | null;
  features: MealFeature[];
  walkMinutes: number | null;
  postMealSleepiness: number | null;
}

export interface SnackInput {
  id?: string;
  eatenAt: string | null;
  occurred: boolean;
  category: "healthy-small" | "planned-meal" | "sweet-only" | "large-or-late" | null;
  amountLevel: "small" | "medium" | "large" | null;
  planned: boolean | null;
  beforeBed: boolean | null;
  note: string;
}

export interface MealTimingInput {
  regular: boolean | null;
  dinnerBeforeBed: boolean | null;
  noLongGap: boolean | null;
}

export interface PhoneInput {
  entertainmentMinutes: number | null;
  separatedDuringWork: boolean | null;
  limitedMorningOrNightUse: boolean | null;
}

export interface ResultInput {
  achievementText: string;
  focusMinutes: number | null;
  reflectionRating: number | null;
  comment: string;
  confirmedAchievementScore: number | null;
}

export interface DailyLogInput {
  clientRequestId?: string;
  date: string;
  sleep: SleepInput;
  mealTiming: MealTimingInput;
  meals: MealInput[];
  snacks: SnackInput[];
  snackRecorded: boolean;
  phone: PhoneInput;
  result: ResultInput;
  aiInsight?: AiInsight | null;
  scoreVersion: string;
}

export interface AiInsight {
  requestId?: string;
  provider?: "gemini" | "fallback";
  model?: string | null;
  achievementScore: number;
  confidence: Confidence;
  reason: string;
  nextExperiment: string;
  confirmed?: boolean;
}

export interface ScoreBreakdown {
  sleep: number | null;
  food: number | null;
  phone: number | null;
  result: number | null;
  total: number | null;
  recordedPoints: number;
  recordedMax: number;
  recordingRate: number;
  provisional: boolean;
}

export interface DailyLog extends DailyLogInput {
  id: string;
  status: LogStatus;
  scores: ScoreBreakdown;
  createdAt: string;
  updatedAt: string;
  timeline: TimelineEvent[];
}

export interface TimelineEvent {
  time: string;
  label: string;
  detail?: string;
}

export interface DailyLogSummary {
  date: string;
  totalScore: number | null;
  recordingRate: number;
  scores: Pick<ScoreBreakdown, "sleep" | "food" | "phone" | "result">;
  status: LogStatus;
}
