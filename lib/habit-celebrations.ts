export const HABIT_CELEBRATIONS = [
  {
    animation: "confetti",
    icon: "✓",
    message: "やった！今日の積み重ねができました。",
  },
  {
    animation: "sparkles",
    icon: "✦",
    message: "すばらしい！継続がまたひとつ伸びました。",
  },
  {
    animation: "rings",
    icon: "◎",
    message: "ナイス達成！未来の自分に一歩前進です。",
  },
  {
    animation: "rising-stars",
    icon: "★",
    message: "完了！今日も自分との約束を守れました。",
  },
] as const;

export type HabitCelebration = (typeof HABIT_CELEBRATIONS)[number];

export function pickHabitCelebration(random: () => number = Math.random): HabitCelebration {
  const value = Math.max(0, Math.min(0.999999, random()));
  return HABIT_CELEBRATIONS[Math.floor(value * HABIT_CELEBRATIONS.length)];
}
