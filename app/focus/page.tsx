import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { FocusResetProgram } from "@/components/focus-reset-program";
import { hasAccess } from "@/lib/auth";
import { isSheetsConfigured } from "@/lib/config";
import { getTodayJst } from "@/lib/date";
import { FOCUS_PROGRAM_END, FOCUS_PROGRAM_START } from "@/lib/focus-program";
import { getStorage } from "@/lib/storage";
import type { FocusDailyLog } from "@/types/domain";

export const dynamic = "force-dynamic";

async function loadFocusData(): Promise<{ logs: FocusDailyLog[]; configurationWarning: boolean }> {
  try {
    return {
      logs: await getStorage().listFocusLogs(FOCUS_PROGRAM_START, FOCUS_PROGRAM_END),
      configurationWarning: !isSheetsConfigured(),
    };
  } catch {
    return { logs: [], configurationWarning: true };
  }
}

export default async function FocusPage() {
  if (!(await hasAccess())) redirect("/access");
  const today = getTodayJst();
  const data = await loadFocusData();
  return (
    <AppShell active="focus">
      <main className="page-content focus-page">
        <div className="page-heading focus-page-heading">
          <div>
            <p className="eyebrow">14-DAY FOCUS RESET</p>
            <h1>PC版YouTubeとの距離を整える</h1>
            <p>禁止ではなく、「気づく → 選ぶ → 戻る」を14日間で練習します。</p>
          </div>
          <span className="focus-period-chip">8/12 → 8/25</span>
        </div>
        {data.configurationWarning ? (
          <div className="warning-banner">
            <span aria-hidden="true">!</span>
            <div><strong>ローカル保存モードです</strong>Google Sheetsの環境変数を設定すると、`focus_logs`へ記録されます。</div>
          </div>
        ) : null}
        <FocusResetProgram initialLogs={data.logs} today={today} />
      </main>
    </AppShell>
  );
}
