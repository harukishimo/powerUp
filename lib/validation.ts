import { z } from "zod";
import { isValidDateString } from "@/lib/date";
import { SCORE_MAX } from "@/lib/scoring";

const nullableInt = (min: number, max: number) => z.number().int().min(min).max(max).nullable();
const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(isValidDateString, "有効な日付を入力してください。");
const nullableTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable();

export const MealInputSchema = z.object({
  id: z.string().min(1).max(100).optional(),
  type: z.enum(["breakfast", "lunch", "dinner"]),
  eatenAt: z.string().max(20).nullable(),
  carbohydrateLevel: z.enum(["sufficient", "small", "none", "large"]).nullable(),
  proteinLevel: z.enum(["sufficient", "small", "none", "large"]).nullable(),
  vegetableLevel: z.enum(["sufficient", "small", "none", "large"]).nullable(),
  portionLevel: z.enum(["just-right", "slightly-high", "overeating"]).nullable(),
  drinkType: z.enum(["water-tea", "unsweetened", "sweet"]).nullable(),
  features: z.array(z.enum(["normal", "noodle", "fried", "eating-out", "double-staple"])).max(5),
  walkMinutes: z.number().int().min(0).max(240).nullable(),
  postMealSleepiness: nullableInt(1, 5),
});

export const SnackInputSchema = z.object({
  id: z.string().min(1).max(100).optional(),
  eatenAt: z.string().max(20).nullable(),
  occurred: z.boolean(),
  category: z.enum(["healthy-small", "planned-meal", "sweet-only", "large-or-late"]).nullable(),
  amountLevel: z.enum(["small", "medium", "large"]).nullable(),
  planned: z.boolean().nullable(),
  beforeBed: z.boolean().nullable(),
  note: z.string().max(240),
});

export const DailyLogInputSchema = z.object({
  clientRequestId: z.string().min(1).max(120).optional(),
  date: dateString,
  sleep: z.object({
    pixelWatchScore: nullableInt(0, 100),
    recoveryFeeling: nullableInt(1, 5),
  }),
  mealTiming: z.object({
    regular: z.boolean().nullable(),
    dinnerBeforeBed: z.boolean().nullable(),
    noLongGap: z.boolean().nullable(),
  }),
  meals: z.array(MealInputSchema).max(3),
  snacks: z.array(SnackInputSchema).max(12),
  snackRecorded: z.boolean(),
  phone: z.object({
    entertainmentMinutes: nullableInt(0, 1440),
    separatedDuringWork: z.boolean().nullable(),
    limitedMorningOrNightUse: z.boolean().nullable(),
  }),
  performanceContext: z.object({
    assessmentTime: nullableTime,
    wakeTime: nullableTime,
    currentAlertness: nullableInt(1, 5),
    continuousWorkMinutes: nullableInt(0, 1440),
    nextCommitmentTime: nullableTime.optional(),
    // 旧形式の保存データを読み込むために受け付ける。新規入力では時刻から再計算する。
    minutesUntilNextCommitment: nullableInt(0, 1440).optional(),
  }).optional(),
  result: z.object({
    achievementText: z.string().max(240),
    focusMinutes: nullableInt(0, 1440),
    reflectionRating: nullableInt(1, 5),
    comment: z.string().max(240),
    confirmedAchievementScore: nullableInt(0, 5),
  }),
  aiInsight: z
    .object({
      requestId: z.string().max(120).optional(),
      provider: z.enum(["gemini", "fallback"]).optional(),
      model: z.string().max(120).nullable().optional(),
      achievementScore: z.number().int().min(0).max(5),
      confidence: z.enum(["low", "medium", "high"]),
      reason: z.string().max(320),
      nextExperiment: z.string().max(240),
      confirmed: z.boolean().optional(),
    })
    .nullable()
    .optional(),
  scoreVersion: z.string().min(1).max(20),
});

export const AiScoreRequestSchema = z.object({
  date: dateString,
  achievementText: z.string().max(240),
  reflectionRating: nullableInt(1, 5),
  focusMinutes: nullableInt(0, 1440),
  foodSummary: z.record(z.string().max(80), z.string().max(240)).refine((value) => Object.keys(value).length <= 12, "食事概要が多すぎます。"),
  deterministicScores: z.object({
    sleep: nullableInt(0, SCORE_MAX.sleep),
    food: nullableInt(0, SCORE_MAX.food),
    phone: nullableInt(0, SCORE_MAX.phone),
  }),
});

export const AiInsightSchema = z.object({
  requestId: z.string().max(120).optional(),
  provider: z.enum(["gemini", "fallback"]).optional(),
  model: z.string().max(120).nullable().optional(),
  achievementScore: z.number().int().min(0).max(5),
  confidence: z.enum(["low", "medium", "high"]),
  reason: z.string().min(1).max(320),
  nextExperiment: z.string().min(1).max(240),
});

export const SaveLogRequestSchema = DailyLogInputSchema.extend({
  clientRequestId: z.string().min(1).max(120),
});

const ScoreBreakdownSchema = z.object({
  sleep: z.number().int().min(0).max(SCORE_MAX.sleep).nullable(),
  food: z.number().int().min(0).max(SCORE_MAX.food).nullable(),
  phone: z.number().int().min(0).max(SCORE_MAX.phone).nullable(),
  result: z.number().int().min(0).max(SCORE_MAX.result).nullable(),
  total: z.number().int().min(0).max(SCORE_MAX.total).nullable(),
  recordedPoints: z.number().int().min(0).max(100),
  recordedMax: z.number().int().min(0).max(100),
  recordingRate: z.number().int().min(0).max(100),
  provisional: z.boolean(),
});

const TimelineEventSchema = z.object({ time: z.string().max(20), label: z.string().max(120), detail: z.string().max(240).optional(), timeZone: z.literal("Asia/Tokyo").optional() });
export const DailyLogSchema = DailyLogInputSchema.extend({
  id: z.string().min(1).max(120),
  status: z.enum(["draft", "proposed", "confirmed"]),
  scores: ScoreBreakdownSchema,
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
  timeline: z.array(TimelineEventSchema).max(50),
});

export const DailyLogSummarySchema = z.object({
  date: dateString,
  totalScore: z.number().int().min(0).max(100).nullable(),
  recordingRate: z.number().int().min(0).max(100),
  scores: z.object({
    sleep: z.number().int().min(0).max(SCORE_MAX.sleep).nullable(),
    food: z.number().int().min(0).max(SCORE_MAX.food).nullable(),
    phone: z.number().int().min(0).max(SCORE_MAX.phone).nullable(),
    result: z.number().int().min(0).max(SCORE_MAX.result).nullable(),
  }),
  status: z.enum(["draft", "proposed", "confirmed"]),
});

export const LogsListResponseSchema = z.object({
  logs: z.array(DailyLogSummarySchema),
  range: z.object({ from: dateString, to: dateString }),
});

export const LogDetailResponseSchema = z.object({ log: DailyLogSchema });
export const SaveLogResponseSchema = z.object({ saved: z.literal(true), clientRequestId: z.string().min(1).max(120), log: DailyLogSchema });
export const AiScoreResponseSchema = z.object({
  proposal: AiInsightSchema,
  provider: z.enum(["gemini", "fallback"]),
  model: z.string().max(120).nullable(),
  requestId: z.string().min(1).max(120),
});
export const ErrorResponseSchema = z.object({ error: z.string().max(240), requestId: z.string().max(120).optional(), retryable: z.boolean().optional() });
