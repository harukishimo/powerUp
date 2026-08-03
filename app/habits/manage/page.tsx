import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { HabitMaster } from "@/components/habit-master";
import { HabitTabs } from "@/components/habit-tabs";
import { hasAccess } from "@/lib/auth";
import { isSheetsConfigured } from "@/lib/config";
import { getStorage } from "@/lib/storage";
import type { Habit } from "@/types/domain";

export const dynamic = "force-dynamic";

async function loadHabits(): Promise<{ habits: Habit[]; configurationWarning: boolean }> {
  try {
    return { habits: await getStorage().listHabits(true), configurationWarning: !isSheetsConfigured() };
  } catch {
    return { habits: [], configurationWarning: true };
  }
}

export default async function HabitManagePage() {
  if (!(await hasAccess())) redirect("/access");
  const data = await loadHabits();
  return (
    <AppShell active="habits">
      <main className="page-content">
        <div className="page-heading habit-page-heading">
          <div>
            <p className="eyebrow">HABIT MASTER</p>
            <h1>継続項目の管理</h1>
            <p>続けたいこと、実行する曜日、表示色を管理します。</p>
          </div>
          <HabitTabs active="manage" />
        </div>
        {data.configurationWarning ? (
          <div className="warning-banner">
            <span aria-hidden="true">!</span>
            <div><strong>ローカル保存モードです</strong>Google Sheetsの環境変数を設定すると、端末をまたいで記録できます。</div>
          </div>
        ) : null}
        <HabitMaster initialHabits={data.habits} />
      </main>
    </AppShell>
  );
}
