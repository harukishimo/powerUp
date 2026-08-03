import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { HabitCalendar } from "@/components/habit-calendar";
import { HabitTabs } from "@/components/habit-tabs";
import { hasAccess } from "@/lib/auth";
import { isSheetsConfigured } from "@/lib/config";
import { getTodayJst } from "@/lib/date";
import { getMonthBounds } from "@/lib/habits";
import { getStorage } from "@/lib/storage";
import type { Habit, HabitLog } from "@/types/domain";

export const dynamic = "force-dynamic";

async function loadHabitData(today: string): Promise<{ habits: Habit[]; logs: HabitLog[]; configurationWarning: boolean }> {
  try {
    const storage = getStorage();
    const habits = await storage.listHabits(false);
    const month = getMonthBounds(today.slice(0, 7));
    const from = habits.reduce(
      (value, habit) => habit.createdAt.slice(0, 10) < value ? habit.createdAt.slice(0, 10) : value,
      month.start,
    );
    const logs = await storage.listHabitLogs(from, month.end > today ? month.end : today);
    return { habits, logs, configurationWarning: !isSheetsConfigured() };
  } catch {
    return { habits: [], logs: [], configurationWarning: true };
  }
}

export default async function HabitsPage() {
  if (!(await hasAccess())) redirect("/access");
  const today = getTodayJst();
  const data = await loadHabitData(today);
  return (
    <AppShell active="habits">
      <main className="page-content">
        <div className="page-heading habit-page-heading">
          <div>
            <p className="eyebrow">CONTINUITY</p>
            <h1>継続カレンダー</h1>
            <p>できた日を積み重ねて、続いていることを目で確認します。</p>
          </div>
          <HabitTabs active="calendar" />
        </div>
        {data.configurationWarning ? (
          <div className="warning-banner">
            <span aria-hidden="true">!</span>
            <div><strong>ローカル保存モードです</strong>Google Sheetsの環境変数を設定すると、端末をまたいで記録できます。</div>
          </div>
        ) : null}
        <HabitCalendar habits={data.habits} initialLogs={data.logs} initialMonth={today.slice(0, 7)} today={today} />
      </main>
    </AppShell>
  );
}
