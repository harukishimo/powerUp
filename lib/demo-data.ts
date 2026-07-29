import { calculateScores } from "@/lib/scoring";
import type { DailyLog, DailyLogInput, MealInput } from "@/types/domain";

const meal = (type: MealInput["type"], options: Partial<MealInput>): MealInput => ({
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
  ...options,
});

export function createDemoInput(date: string): DailyLogInput {
  return {
    date,
    sleep: { pixelWatchScore: 82, recoveryFeeling: 4 },
    mealTiming: { regular: true, dinnerBeforeBed: true, noLongGap: true },
    meals: [
      meal("breakfast", {
        eatenAt: "08:05",
        carbohydrateLevel: "sufficient",
        proteinLevel: "sufficient",
        vegetableLevel: "sufficient",
        portionLevel: "just-right",
        drinkType: "water-tea",
        walkMinutes: 10,
      }),
      meal("lunch", {
        eatenAt: "12:30",
        carbohydrateLevel: "sufficient",
        proteinLevel: "sufficient",
        vegetableLevel: "sufficient",
        portionLevel: "just-right",
        drinkType: "unsweetened",
        features: ["noodle"],
        walkMinutes: 0,
        postMealSleepiness: 4,
      }),
      meal("dinner", {
        eatenAt: "19:10",
        carbohydrateLevel: "sufficient",
        proteinLevel: "sufficient",
        vegetableLevel: "sufficient",
        portionLevel: "just-right",
        drinkType: "water-tea",
        features: ["noodle"],
        walkMinutes: 0,
      }),
    ],
    snacks: [
      {
        id: `${date}-snack-1`,
        eatenAt: "16:00",
        occurred: true,
        category: "healthy-small",
        amountLevel: "small",
        planned: true,
        beforeBed: false,
        note: "素焼きナッツ少量",
      },
    ],
    snackRecorded: true,
    phone: { entertainmentMinutes: 120, separatedDuringWork: false, limitedMorningOrNightUse: false },
    result: {
      achievementText: "企画書の構成を完成させ、上司にレビュー依頼を送った。",
      focusMinutes: 75,
      reflectionRating: 4,
      comment: "昼食後は少し眠かったが、午後に集中を取り戻せた。",
      confirmedAchievementScore: 4,
    },
    scoreVersion: "v1",
  };
}

export function createDemoLog(date: string): DailyLog {
  const input = createDemoInput(date);
  const now = `${date}T21:20:00+09:00`;
  return {
    ...input,
    id: `demo-${date}`,
    status: "confirmed",
    scores: calculateScores(input),
    createdAt: now,
    updatedAt: now,
    timeline: [
      { time: "08:05", label: "睡眠を記録", detail: "Pixel Watch 82" },
      { time: "12:30", label: "昼食を記録", detail: "食後の眠気 4 / 5" },
      { time: "18:10", label: "集中作業を記録", detail: "75分" },
      { time: "21:20", label: "振り返りを保存" },
    ],
  };
}

export function createBlankLog(date: string): DailyLog {
  const input: DailyLogInput = {
    date,
    sleep: { pixelWatchScore: null, recoveryFeeling: null },
    mealTiming: { regular: null, dinnerBeforeBed: null, noLongGap: null },
    meals: [],
    snacks: [],
    snackRecorded: false,
    phone: { entertainmentMinutes: null, separatedDuringWork: null, limitedMorningOrNightUse: null },
    result: { achievementText: "", focusMinutes: null, reflectionRating: null, comment: "", confirmedAchievementScore: null },
    scoreVersion: "v1",
  };
  const now = new Date().toISOString();
  return {
    ...input,
    id: `log-${date}`,
    status: "draft",
    scores: calculateScores(input),
    createdAt: now,
    updatedAt: now,
    timeline: [],
  };
}
