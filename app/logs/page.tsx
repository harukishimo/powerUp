import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { LogReview } from "@/components/log-review";
import { hasAccess } from "@/lib/auth";
import { isSheetsConfigured } from "@/lib/config";
import { createBlankLog } from "@/lib/demo-data";
import { getTodayJst, shiftDate } from "@/lib/date";
import { getStorage } from "@/lib/storage";

export const dynamic = "force-dynamic";

async function loadLogsData(today: string) {
  try {
    const storage = getStorage();
    const [summaries, selected] = await Promise.all([
      storage.list(shiftDate(today, -6), today),
      storage.get(today),
    ]);
    return { summaries, selected: selected ?? createBlankLog(today), configurationWarning: !isSheetsConfigured() };
  } catch {
    return { summaries: [], selected: createBlankLog(today), configurationWarning: true };
  }
}

export default async function LogsPage() {
  if (!(await hasAccess())) redirect("/access");
  const today = getTodayJst();
  const data = await loadLogsData(today);
  return (
    <AppShell active="logs">
      <main className="page-content">
        <div className="page-heading compact-heading">
          <div>
            <p className="eyebrow">DAILY REVIEW</p>
            <h1>デイリーログ</h1>
            <p>点数だけではなく、その日の流れを振り返ります。</p>
          </div>
        </div>
        <LogReview summaries={data.summaries} initialLog={data.selected} configurationWarning={data.configurationWarning} />
      </main>
    </AppShell>
  );
}
