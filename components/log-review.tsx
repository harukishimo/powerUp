"use client";

import { useMemo, useState } from "react";
import { parseApiResponse } from "@/lib/client-api";
import { createBlankLog } from "@/lib/demo-data";
import { shiftDate } from "@/lib/date";
import { LogDetailResponseSchema } from "@/lib/validation";
import type { DailyLog, DailyLogSummary } from "@/types/domain";

function shortDate(date: string) {
  const value = new Date(`${date}T12:00:00+09:00`);
  return `${value.getMonth() + 1}/${value.getDate()}`;
}

function dayLabel(date: string) {
  const value = new Date(`${date}T12:00:00+09:00`);
  return new Intl.DateTimeFormat("ja-JP", { weekday: "short" }).format(value);
}

function score(value: number | null, max: number) {
  return value === null ? "未記録" : `${value} / ${max}`;
}

export function LogReview({
  summaries: initialSummaries,
  initialLog,
  configurationWarning = false,
}: {
  summaries: DailyLogSummary[];
  initialLog: DailyLog;
  configurationWarning?: boolean;
}) {
  const [summaries] = useState(initialSummaries);
  const [selectedDate, setSelectedDate] = useState(initialLog.date);
  const [selectedLog, setSelectedLog] = useState(initialLog);
  const [cache, setCache] = useState<Record<string, DailyLog>>({ [initialLog.date]: initialLog });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const sortedSummaries = useMemo(() => [...summaries].sort((a, b) => b.date.localeCompare(a.date)), [summaries]);
  const sevenDays = useMemo(() => {
    const byDate = new Map(sortedSummaries.map((summary) => [summary.date, summary]));
    return Array.from({ length: 7 }, (_, index) => {
      const date = shiftDate(initialLog.date, -index);
      return byDate.get(date) ?? { date, totalScore: null, recordingRate: 0, scores: { sleep: null, food: null, phone: null, result: null }, status: "draft" as const };
    });
  }, [initialLog.date, sortedSummaries]);

  async function selectDate(date: string) {
    if (date === selectedDate) return;
    setSelectedDate(date);
    setError("");
    const cached = cache[date];
    if (cached) {
      setSelectedLog(cached);
      return;
    }
    setLoading(true);
    try {
      const response = await fetch(`/api/logs/${date}`, { cache: "no-store" });
      if (response.status === 404) {
        const blank = createBlankLog(date);
        setCache((current) => ({ ...current, [date]: blank }));
        setSelectedLog(blank);
        setError("この日は未記録です。");
        return;
      }
      const data = await parseApiResponse(response, LogDetailResponseSchema);
      setCache((current) => ({ ...current, [date]: data.log }));
      setSelectedLog(data.log);
    } catch {
      setError("この日の詳細を取得できませんでした。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="card log-review" aria-labelledby="log-review-title">
      {configurationWarning ? <div className="warning-banner"><span aria-hidden="true">!</span><div><strong>確認用モード</strong><span>Google Sheets未接続のため、表示と保存は確認用です。Vercel環境変数を設定すると実データを保存できます。</span></div></div> : null}
      <div className="card-heading">
        <div><h2 id="log-review-title">デイリーログを振り返る</h2><p>直近7日間の記録を、点数と流れで確認できます。</p></div>
        {loading ? <span className="date-chip">読み込み中…</span> : null}
      </div>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      <div className="log-review-layout" style={{ marginTop: 18 }}>
        <div className="day-list" role="listbox" aria-label="日付を選択">
          {sevenDays.map((summary) => (
            <button key={summary.date} type="button" role="option" aria-selected={selectedDate === summary.date} className={`day-button ${selectedDate === summary.date ? "selected" : ""}`} onClick={() => selectDate(summary.date)}>
              <span className="day-date">{shortDate(summary.date)}</span>
              <span className="day-label">{dayLabel(summary.date)}</span>
              <span className={`day-score ${summary.totalScore === null ? "missing-text" : ""}`}>{summary.totalScore ?? "未記録"}</span>
            </button>
          ))}
        </div>
        <LogDetail log={selectedLog} />
      </div>
    </section>
  );
}

function LogDetail({ log }: { log: DailyLog }) {
  return (
    <div className="log-detail" aria-live="polite">
      <div className="log-detail-head">
        <div><div className="log-detail-date">{log.date}</div><div className="log-detail-title">{log.result.achievementText || "この日の記録を整えましょう。"}</div></div>
        <div className="log-detail-score">{log.scores.total === null ? "未記録" : `${log.scores.total} / 100`}</div>
      </div>
      <div className="detail-grid">
        <DetailStat label="睡眠" value={score(log.scores.sleep, 50)} />
        <DetailStat label="食事" value={score(log.scores.food, 30)} />
        <DetailStat label="スマホ" value={score(log.scores.phone, 10)} />
        <DetailStat label="成果" value={score(log.scores.result, 10)} />
      </div>
      <div className="detail-comment"><strong>今日の振り返り</strong>{log.result.comment || "コメントは未入力です。"}</div>
      <div className="detail-records">
        <DetailRecord label="睡眠" value={log.sleep.pixelWatchScore === null ? "未記録" : `Pixel Watch ${log.sleep.pixelWatchScore} · 回復感 ${log.sleep.recoveryFeeling ?? "未記録"} / 5`} />
        <DetailRecord label="食事" value={log.meals.map((meal) => `${meal.type === "breakfast" ? "朝食" : meal.type === "lunch" ? "昼食" : "夕食"} ${meal.eatenAt ?? "未記録"}`).join(" / ") || "朝食・昼食・夕食は未記録"} />
        <DetailRecord label="間食" value={!log.snackRecorded ? "未記録" : log.snacks.length === 0 ? "なし" : `${log.snacks.length}件`} />
        <DetailRecord label="スマートフォン" value={log.phone.entertainmentMinutes === null ? "未記録" : `娯楽 ${log.phone.entertainmentMinutes}分 · 作業中 ${log.phone.separatedDuringWork === true ? "分離" : "未分離"}`} />
        <DetailRecord label="実際の成果" value={log.result.achievementText || "未記録"} />
      </div>
      {log.aiInsight ? <div className="detail-ai"><strong>Geminiの気づき</strong>{log.aiInsight.nextExperiment}</div> : null}
      <div className="detail-timeline">
        {(log.timeline.length > 0 ? log.timeline : [{ time: "—", label: "まだイベントがありません。" }]).map((event, index) => <div className="detail-event" key={`${event.time}-${index}`}><time>{event.time}</time><span>{event.label}{event.detail ? ` · ${event.detail}` : ""}</span></div>)}
      </div>
    </div>
  );
}

function DetailStat({ label, value }: { label: string; value: string }) {
  return <div className="detail-stat"><span>{label}</span><strong>{value}</strong></div>;
}

function DetailRecord({ label, value }: { label: string; value: string }) {
  return <div className="detail-record"><strong>{label}</strong><span>{value}</span></div>;
}
