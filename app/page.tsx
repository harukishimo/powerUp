import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { PowerUpDashboard } from "@/components/powerup-dashboard";
import { hasAccess } from "@/lib/auth";
import { isSheetsConfigured } from "@/lib/config";
import { createBlankLog } from "@/lib/demo-data";
import { getTodayJst, shiftDate } from "@/lib/date";
import { getStorage } from "@/lib/storage";

export const dynamic = "force-dynamic";

async function loadHomeData(today: string) {
  try {
    const storage = getStorage();
    const [initialLog, summaries] = await Promise.all([
      storage.get(today),
      storage.list(shiftDate(today, -6), today),
    ]);
    return { initialLog: initialLog ?? createBlankLog(today), summaries, configurationWarning: !isSheetsConfigured() };
  } catch {
    return { initialLog: createBlankLog(today), summaries: [], configurationWarning: true };
  }
}

export default async function HomePage() {
  if (!(await hasAccess())) redirect("/access");
  const today = getTodayJst();
  const data = await loadHomeData(today);
  return (
    <AppShell active="today">
      <PowerUpDashboard initialLog={data.initialLog} initialSummaries={data.summaries} configurationWarning={data.configurationWarning} />
    </AppShell>
  );
}
