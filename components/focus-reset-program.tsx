"use client";

import { useEffect, useMemo, useState } from "react";
import { parseApiResponse } from "@/lib/client-api";
import { formatJapaneseDate, getCurrentTimeJst, nowJstIso } from "@/lib/date";
import {
  createBlankFocusLog,
  FOCUS_ENVIRONMENT_CHECKS,
  FOCUS_PROGRAM,
  FOCUS_PROGRAM_END,
  FOCUS_PROGRAM_START,
  FOCUS_TRIGGER_LABELS,
  getFocusProgramDay,
  isFocusDayComplete,
  latestEnvironmentChecks,
  metricReduction,
} from "@/lib/focus-program";
import { FocusLogResponseSchema } from "@/lib/validation";
import type { FocusDailyLog, FocusDailyLogInput, FocusMetrics, FocusUrgeOutcome, FocusUrgeTrigger } from "@/types/domain";

const METRIC_FIELDS: Array<{ key: keyof FocusMetrics; label: string; unit: string; hint: string }> = [
  { key: "aimlessOpenCount", label: "無目的起動", unit: "回", hint: "目的なしでYouTubeを開いた回数" },
  { key: "workYoutubeMinutes", label: "仕事中のYouTube", unit: "分", hint: "技術調査以外の視聴時間" },
  { key: "shortsMinutes", label: "Shorts", unit: "分", hint: "PC・スマホを合わせた時間" },
  { key: "workStartDelayMinutes", label: "仕事開始まで", unit: "分", hint: "始める予定から着手まで" },
  { key: "recognizedUrges", label: "欲求に気づいた", unit: "回", hint: "開く前後に認識できた回数" },
  { key: "returnedToWorkCount", label: "開いたあと戻れた", unit: "回", hint: "閉じて5分作業へ戻った回数" },
];

const OUTCOME_LABELS: Record<FocusUrgeOutcome, string> = {
  "noticed-not-opened": "開かずに戻れた",
  "closed-returned": "開いたが閉じて戻った",
  watched: "視聴した",
};

function toDraft(log: FocusDailyLog): FocusDailyLogInput {
  return {
    date: log.date,
    firstTask: log.firstTask,
    completedActionIds: log.completedActionIds,
    environmentCheckIds: log.environmentCheckIds,
    metrics: log.metrics,
    urgeEvents: log.urgeEvents,
    purposeEntries: log.purposeEntries,
    reflection: log.reflection,
  };
}

function initialSelectedDate(today: string) {
  if (today < FOCUS_PROGRAM_START) return FOCUS_PROGRAM_START;
  if (today > FOCUS_PROGRAM_END) return FOCUS_PROGRAM_END;
  return today;
}

function numericInput(value: string) {
  if (value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.round(number)) : null;
}

function formatTimer(seconds: number) {
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function comparisonText(value: number | null) {
  if (value === null) return "比較待ち";
  if (value > 0) return `${value}% 減`;
  if (value < 0) return `${Math.abs(value)}% 増`;
  return "変化なし";
}

export function FocusResetProgram({ initialLogs, today }: { initialLogs: FocusDailyLog[]; today: string }) {
  const [logs, setLogs] = useState(initialLogs);
  const [selectedDate, setSelectedDate] = useState(initialSelectedDate(today));
  const [drafts, setDrafts] = useState<Record<string, FocusDailyLogInput>>(() => Object.fromEntries(initialLogs.map((log) => [log.date, toDraft(log)])));
  const [dirtyDates, setDirtyDates] = useState<Set<string>>(() => new Set());
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [purposeText, setPurposeText] = useState("");
  const [urgeTrigger, setUrgeTrigger] = useState<FocusUrgeTrigger>("difficult");
  const [urgeNote, setUrgeNote] = useState("");
  const [watchedMinutes, setWatchedMinutes] = useState("");
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [timerStarted, setTimerStarted] = useState(false);

  useEffect(() => {
    if (timerSeconds <= 0) return;
    const timeout = window.setTimeout(() => setTimerSeconds((seconds) => Math.max(0, seconds - 1)), 1000);
    return () => window.clearTimeout(timeout);
  }, [timerSeconds]);

  const inheritedEnvironment = useMemo(() => latestEnvironmentChecks(logs), [logs]);
  const selectedDay = getFocusProgramDay(selectedDate) ?? FOCUS_PROGRAM[0];
  const draft = drafts[selectedDate] ?? createBlankFocusLog(selectedDate, inheritedEnvironment);
  const future = selectedDate > today;
  const baseline = drafts[FOCUS_PROGRAM_START] ?? logs.find((log) => log.date === FOCUS_PROGRAM_START);
  const completedDays = FOCUS_PROGRAM.filter((day) => {
    const value = drafts[day.date] ?? logs.find((log) => log.date === day.date);
    return isFocusDayComplete(value, day);
  }).length;
  const totalUrges = logs.reduce((sum, log) => sum + log.urgeEvents.length, 0);
  const controlledUrges = logs.reduce(
    (sum, log) => sum + log.urgeEvents.filter((event) => event.outcome !== "watched").length,
    0,
  );
  const environmentRate = Math.round((draft.environmentCheckIds.length / FOCUS_ENVIRONMENT_CHECKS.length) * 100);
  const actionRate = selectedDay.actions.length > 0
    ? Math.round((selectedDay.actions.filter((action) => draft.completedActionIds.includes(action.id)).length / selectedDay.actions.length) * 100)
    : 0;

  function ensureDraft(date: string, current = drafts) {
    return current[date] ?? createBlankFocusLog(date, inheritedEnvironment);
  }

  function updateDraft(updater: (current: FocusDailyLogInput) => FocusDailyLogInput) {
    setDrafts((current) => ({ ...current, [selectedDate]: updater(ensureDraft(selectedDate, current)) }));
    setDirtyDates((current) => new Set(current).add(selectedDate));
    setMessage("");
    setError("");
  }

  async function persist(input: FocusDailyLogInput, successMessage: string) {
    setDrafts((current) => ({ ...current, [input.date]: input }));
    setDirtyDates((current) => new Set(current).add(input.date));
    setPending(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/focus", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      });
      const data = await parseApiResponse(response, FocusLogResponseSchema);
      setLogs((current) => [...current.filter((log) => log.date !== data.log.date), data.log].sort((a, b) => a.date.localeCompare(b.date)));
      setDrafts((current) => ({ ...current, [data.log.date]: toDraft(data.log) }));
      setDirtyDates((current) => {
        const next = new Set(current);
        next.delete(data.log.date);
        return next;
      });
      setMessage(successMessage);
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "記録を保存できませんでした。");
      return false;
    } finally {
      setPending(false);
    }
  }

  function selectDate(date: string) {
    setSelectedDate(date);
    setDrafts((current) => current[date] ? current : { ...current, [date]: createBlankFocusLog(date, inheritedEnvironment) });
    setMessage("");
    setError("");
  }

  function toggleAction(actionId: string) {
    const ids = draft.completedActionIds.includes(actionId)
      ? draft.completedActionIds.filter((id) => id !== actionId)
      : [...draft.completedActionIds, actionId];
    const next = { ...draft, completedActionIds: ids };
    void persist(next, ids.includes(actionId) ? "今日の行動を記録しました。" : "行動チェックを更新しました。");
  }

  function toggleEnvironment(checkId: string) {
    const ids = draft.environmentCheckIds.includes(checkId)
      ? draft.environmentCheckIds.filter((id) => id !== checkId)
      : [...draft.environmentCheckIds, checkId];
    void persist({ ...draft, environmentCheckIds: ids }, "PC環境の設定状況を更新しました。");
  }

  async function addPurpose() {
    const purpose = purposeText.trim();
    if (!purpose) {
      setError("YouTubeで確認する目的を1行入力してください。");
      return;
    }
    const next: FocusDailyLogInput = {
      ...draft,
      purposeEntries: [...draft.purposeEntries, {
        id: `purpose-${crypto.randomUUID()}`,
        time: getCurrentTimeJst(),
        purpose,
        createdAt: nowJstIso(),
      }],
    };
    if (await persist(next, "目的を記録しました。見終わったらタブごと閉じましょう。")) setPurposeText("");
  }

  async function addUrge(outcome: FocusUrgeOutcome) {
    const minutes = outcome === "watched" ? numericInput(watchedMinutes) : null;
    const next: FocusDailyLogInput = {
      ...draft,
      metrics: {
        ...draft.metrics,
        recognizedUrges: (draft.metrics.recognizedUrges ?? 0) + 1,
        returnedToWorkCount: (draft.metrics.returnedToWorkCount ?? 0) + (outcome === "closed-returned" ? 1 : 0),
      },
      urgeEvents: [...draft.urgeEvents, {
        id: `urge-${crypto.randomUUID()}`,
        time: getCurrentTimeJst(),
        trigger: urgeTrigger,
        note: urgeNote.trim(),
        outcome,
        watchedMinutes: minutes,
        createdAt: nowJstIso(),
      }],
    };
    const success = await persist(
      next,
      outcome === "watched"
        ? "記録しました。失敗ではありません。次に1つだけ摩擦を追加しましょう。"
        : outcome === "closed-returned"
          ? "自分で気づいて戻れました。この復帰行動が大切です。"
          : "開く前に選べました。小さな成功を積み上げています。",
    );
    if (success) {
      setUrgeNote("");
      setWatchedMinutes("");
    }
  }

  function startTimer() {
    setTimerStarted(true);
    setTimerSeconds(300);
  }

  return (
    <div
      className="focus-program"
      onKeyDown={(event) => {
        if ((event.metaKey || event.ctrlKey) && event.key === "Enter" && !future && !pending) {
          event.preventDefault();
          void persist(draft, "今日の記録を保存しました。");
        }
      }}
    >
      <section className="focus-summary-grid" aria-label="14日間の進捗">
        <article className="card focus-summary-card focus-summary-primary">
          <span>プログラム進捗</span>
          <strong>{completedDays}<small> / 14日</small></strong>
          <div className="focus-progress"><span style={{ width: `${Math.round((completedDays / 14) * 100)}%` }} /></div>
        </article>
        <article className="card focus-summary-card">
          <span>欲求を認識</span>
          <strong>{totalUrges}<small> 回</small></strong>
          <p>気づいた時点で改善の入口です</p>
        </article>
        <article className="card focus-summary-card">
          <span>開かずに選択・復帰</span>
          <strong>{controlledUrges}<small> 回</small></strong>
          <p>一度開いても戻れれば成功</p>
        </article>
        <article className="card focus-summary-card">
          <span>PC環境ガード</span>
          <strong>{environmentRate}<small>%</small></strong>
          <p>{draft.environmentCheckIds.length} / {FOCUS_ENVIRONMENT_CHECKS.length} 項目</p>
        </article>
      </section>

      <section className="card focus-program-strip" aria-label="14日間の日程">
        {FOCUS_PROGRAM.map((day) => {
          const value = drafts[day.date] ?? logs.find((log) => log.date === day.date);
          const complete = isFocusDayComplete(value, day);
          const disabled = day.date > today;
          return (
            <button
              key={day.date}
              className={`${day.date === selectedDate ? "selected" : ""} ${complete ? "completed" : ""} ${day.date === today ? "today" : ""}`}
              disabled={disabled}
              onClick={() => selectDate(day.date)}
              aria-label={`Day ${day.day} ${day.title}${complete ? " 完了" : ""}`}
            >
              <span>{complete ? "✓" : day.day}</span>
              <small>{Number(day.date.slice(5, 7))}/{Number(day.date.slice(8, 10))}</small>
            </button>
          );
        })}
      </section>

      <section className="focus-day-hero card">
        <div>
          <p className="eyebrow">DAY {selectedDay.day} · {formatJapaneseDate(selectedDate)}</p>
          <h2>{selectedDay.title}</h2>
          <p>{selectedDay.description}</p>
        </div>
        <div className="focus-day-target">
          <span>今日の狙い</span>
          <strong>{selectedDay.target}</strong>
          <div className="focus-progress"><span style={{ width: `${actionRate}%` }} /></div>
        </div>
      </section>

      {future ? <div className="focus-future-note">この日はまだ始まっていません。内容の確認だけできます。</div> : null}
      {error ? <p className="focus-feedback error" role="alert">{error}</p> : null}
      {message ? <p className="focus-feedback success" role="status">{message}</p> : null}

      <div className="focus-workspace">
        <div className="focus-main-column">
          <section className="card focus-section-card">
            <div className="focus-section-head">
              <div><p className="eyebrow">TODAY&apos;S PROTOCOL</p><h2>今日やること</h2></div>
              <span>{selectedDay.actions.filter((action) => draft.completedActionIds.includes(action.id)).length}/{selectedDay.actions.length}</span>
            </div>
            {selectedDay.day === 2 || selectedDay.day === 8 ? (
              <div className="field focus-first-task">
                <label htmlFor="focus-first-task">今日最初にやること</label>
                <input
                  id="focus-first-task"
                  disabled={future}
                  maxLength={160}
                  placeholder="例：エラー文をコピーして原因候補を3つ書く"
                  value={draft.firstTask}
                  onChange={(event) => updateDraft((current) => ({ ...current, firstTask: event.target.value }))}
                />
              </div>
            ) : null}
            <div className="focus-action-list">
              {selectedDay.actions.map((action) => {
                const checked = draft.completedActionIds.includes(action.id);
                return (
                  <button
                    type="button"
                    className={checked ? "completed" : ""}
                    disabled={future || pending}
                    key={action.id}
                    onClick={() => toggleAction(action.id)}
                  >
                    <span>{checked ? "✓" : ""}</span>
                    <span><strong>{action.label}</strong>{action.detail ? <small>{action.detail}</small> : null}</span>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="card focus-section-card focus-purpose-card">
            <div className="focus-section-head">
              <div><p className="eyebrow">PURPOSE BEFORE OPEN</p><h2>YouTubeを開く目的</h2></div>
              <span>1行ルール</span>
            </div>
            <p className="focus-section-description">「なんとなく」ではなく、見るものを決めてから開きます。</p>
            <div className="focus-inline-form">
              <input
                aria-label="YouTubeを開く目的"
                disabled={future || pending}
                maxLength={160}
                placeholder="例：RailsのN+1対策を確認する"
                value={purposeText}
                onChange={(event) => setPurposeText(event.target.value)}
              />
              <button className="primary-button" disabled={future || pending} onClick={() => void addPurpose()}>目的を記録</button>
            </div>
            {draft.purposeEntries.length > 0 ? (
              <div className="focus-mini-log">
                {[...draft.purposeEntries].reverse().slice(0, 5).map((entry) => (
                  <div key={entry.id}><time>{entry.time}</time><span>{entry.purpose}</span></div>
                ))}
              </div>
            ) : <p className="focus-empty-copy">今日の目的メモはまだありません。</p>}
          </section>

          <section className="card focus-section-card">
            <div className="focus-section-head">
              <div><p className="eyebrow">DAILY METRICS</p><h2>今日の観測値</h2></div>
              {baseline && selectedDate !== FOCUS_PROGRAM_START ? <span>Day1比較</span> : <span>ベースライン</span>}
            </div>
            <p className="focus-section-description">評価ではなく、どの環境で戻りやすかったかを見つけるための記録です。</p>
            <div className="focus-metric-fields">
              {METRIC_FIELDS.map((field) => (
                <label key={field.key}>
                  <span>{field.label}<small>{field.hint}</small></span>
                  <span className="focus-number-input">
                    <input
                      type="number"
                      min="0"
                      max={field.key.includes("Minutes") ? 1440 : 500}
                      disabled={future}
                      value={draft.metrics[field.key] ?? ""}
                      onChange={(event) => {
                        const value = numericInput(event.target.value);
                        updateDraft((current) => ({ ...current, metrics: { ...current.metrics, [field.key]: value } }));
                      }}
                    />
                    <span>{field.unit}</span>
                  </span>
                </label>
              ))}
            </div>
            {baseline && selectedDate !== FOCUS_PROGRAM_START ? (
              <div className="focus-comparison-grid">
                <div><span>無目的起動</span><strong>{comparisonText(metricReduction(baseline.metrics.aimlessOpenCount, draft.metrics.aimlessOpenCount))}</strong></div>
                <div><span>仕事中YouTube</span><strong>{comparisonText(metricReduction(baseline.metrics.workYoutubeMinutes, draft.metrics.workYoutubeMinutes))}</strong></div>
                <div><span>Shorts</span><strong>{comparisonText(metricReduction(baseline.metrics.shortsMinutes, draft.metrics.shortsMinutes))}</strong></div>
                <div><span>着手の遅れ</span><strong>{comparisonText(metricReduction(baseline.metrics.workStartDelayMinutes, draft.metrics.workStartDelayMinutes))}</strong></div>
              </div>
            ) : null}
            <div className="field focus-reflection-field">
              <label htmlFor="focus-reflection">今日の振り返り</label>
              <textarea
                id="focus-reflection"
                disabled={future}
                maxLength={500}
                placeholder="何がトリガーだったか、どの対策を突破したか、次に摩擦をどこへ1つ追加するか"
                value={draft.reflection}
                onChange={(event) => updateDraft((current) => ({ ...current, reflection: event.target.value }))}
              />
            </div>
          </section>
        </div>

        <aside className="focus-side-column">
          <section className="card focus-rescue-card">
            <div className="focus-rescue-head">
              <span aria-hidden="true">↩</span>
              <div><p className="eyebrow">URGE INTERRUPTER</p><h2>YouTubeに逃げたくなった</h2></div>
            </div>
            <p>開いても失敗ではありません。気づいた状況と、その後どう選んだかを残します。</p>
            <label className="focus-select-label">
              <span>直前に何が起きていた？</span>
              <select disabled={future || pending} value={urgeTrigger} onChange={(event) => setUrgeTrigger(event.target.value as FocusUrgeTrigger)}>
                {Object.entries(FOCUS_TRIGGER_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <label className="focus-select-label">
              <span>状況メモ（任意）</span>
              <input disabled={future || pending} maxLength={240} placeholder="例：バグ原因が分からない" value={urgeNote} onChange={(event) => setUrgeNote(event.target.value)} />
            </label>
            <label className="focus-select-label focus-watched-minutes">
              <span>視聴した場合の時間（任意）</span>
              <input disabled={future || pending} min="0" max="1440" type="number" value={watchedMinutes} onChange={(event) => setWatchedMinutes(event.target.value)} />
              <small>分</small>
            </label>
            <div className="focus-outcome-actions">
              <button disabled={future || pending} onClick={() => void addUrge("noticed-not-opened")}>開かずに戻れた</button>
              <button disabled={future || pending} onClick={() => void addUrge("closed-returned")}>閉じて戻った</button>
              <button className="watched" disabled={future || pending} onClick={() => void addUrge("watched")}>視聴した</button>
            </div>
            <div className="focus-timer">
              <div><span>5分だけ今の仕事へ</span><strong>{timerStarted ? formatTimer(timerSeconds) : "05:00"}</strong></div>
              {timerStarted && timerSeconds === 0
                ? <p>5分達成。続けるか、低刺激の休憩を選べます。</p>
                : <button className="ghost-button" disabled={future || timerSeconds > 0} onClick={startTimer}>{timerSeconds > 0 ? "作業中" : "5分スタート"}</button>}
            </div>
            {draft.urgeEvents.length > 0 ? (
              <div className="focus-urge-log">
                {[...draft.urgeEvents].reverse().slice(0, 6).map((event) => (
                  <div key={event.id}>
                    <time>{event.time}</time>
                    <span><strong>{FOCUS_TRIGGER_LABELS[event.trigger]}</strong><small>{OUTCOME_LABELS[event.outcome]}{event.watchedMinutes !== null ? ` · ${event.watchedMinutes}分` : ""}</small></span>
                  </div>
                ))}
              </div>
            ) : null}
          </section>

          <details className="card focus-environment-card" open={selectedDay.day === 1}>
            <summary>
              <span><small>PC ENVIRONMENT</small><strong>誘惑を減らす環境設定</strong></span>
              <b>{draft.environmentCheckIds.length}/{FOCUS_ENVIRONMENT_CHECKS.length}</b>
            </summary>
            <p>主に仕事用ブラウザの状態を記録します。</p>
            <div className="focus-environment-list">
              {FOCUS_ENVIRONMENT_CHECKS.map((check) => {
                const checked = draft.environmentCheckIds.includes(check.id);
                return (
                  <button className={checked ? "completed" : ""} disabled={future || pending} key={check.id} onClick={() => toggleEnvironment(check.id)}>
                    <span>{checked ? "✓" : ""}</span>{check.label}
                  </button>
                );
              })}
            </div>
          </details>
        </aside>
      </div>

      {!future ? (
        <div className="focus-save-dock">
          <span>{dirtyDates.has(selectedDate) ? "未保存の入力があります" : "保存済み"}<small>⌘ / Ctrl + Enterでも保存</small></span>
          <button className="primary-button" disabled={pending} onClick={() => void persist(draft, "今日の記録を保存しました。")}>
            {pending ? "保存中…" : "今日の記録を保存"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
