"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { parseApiResponse } from "@/lib/client-api";
import { formatJapaneseDate } from "@/lib/date";
import { pickHabitCelebration, type HabitCelebration } from "@/lib/habit-celebrations";
import {
  buildMonthCalendar,
  calculateHabitStreak,
  formatTargetDays,
  getMonthBounds,
  isHabitScheduled,
  shiftMonth,
} from "@/lib/habits";
import { HabitLogResponseSchema, HabitLogsResponseSchema } from "@/lib/validation";
import type { Habit, HabitLog } from "@/types/domain";

const WEEKDAYS = ["月", "火", "水", "木", "金", "土", "日"];
const CELEBRATION_PARTICLES = Array.from({ length: 12 }, (_, index) => index);

function monthTitle(month: string) {
  const [year, monthNumber] = month.split("-");
  return `${year}年${Number(monthNumber)}月`;
}

function logKey(habitId: string, date: string) {
  return `${habitId}:${date}`;
}

function CelebrationEffect({ animation }: { animation: HabitCelebration["animation"] }) {
  if (animation === "confetti") {
    return <div className="habit-celebration-effect celebration-confetti" aria-hidden="true">{CELEBRATION_PARTICLES.map((particle) => <i key={particle} />)}</div>;
  }
  if (animation === "sparkles") {
    return <div className="habit-celebration-effect celebration-sparkles" aria-hidden="true">{CELEBRATION_PARTICLES.slice(0, 8).map((particle) => <i key={particle}>✦</i>)}</div>;
  }
  if (animation === "rings") {
    return <div className="habit-celebration-effect celebration-rings" aria-hidden="true">{CELEBRATION_PARTICLES.slice(0, 3).map((particle) => <i key={particle} />)}</div>;
  }
  return <div className="habit-celebration-effect celebration-rising-stars" aria-hidden="true">{CELEBRATION_PARTICLES.slice(0, 9).map((particle) => <i key={particle}>{particle % 2 === 0 ? "★" : "●"}</i>)}</div>;
}

export function HabitCalendar({
  habits,
  initialLogs,
  initialMonth,
  today,
}: {
  habits: Habit[];
  initialLogs: HabitLog[];
  initialMonth: string;
  today: string;
}) {
  const [month, setMonth] = useState(initialMonth);
  const [logs, setLogs] = useState(initialLogs);
  const [selectedDate, setSelectedDate] = useState(today);
  const [loading, setLoading] = useState(false);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [celebration, setCelebration] = useState<{ id: number; habitName: string; definition: HabitCelebration } | null>(null);
  const celebrationId = useRef(0);

  useEffect(() => {
    if (!celebration) return;
    const currentId = celebration.id;
    const timeout = window.setTimeout(() => {
      setCelebration((current) => current?.id === currentId ? null : current);
    }, 2600);
    return () => window.clearTimeout(timeout);
  }, [celebration]);

  const completedKeys = useMemo(
    () => new Set(logs.filter((log) => log.completed).map((log) => logKey(log.habitId, log.date))),
    [logs],
  );
  const calendar = useMemo(() => buildMonthCalendar(month), [month]);
  const selectedHabits = habits.filter((habit) => isHabitScheduled(habit, selectedDate));
  const monthDates = calendar.filter((cell) => cell.inMonth && cell.date <= today);
  const scheduledCount = monthDates.reduce((sum, cell) => sum + habits.filter((habit) => isHabitScheduled(habit, cell.date)).length, 0);
  const completedCount = monthDates.reduce(
    (sum, cell) => sum + habits.filter((habit) => isHabitScheduled(habit, cell.date) && completedKeys.has(logKey(habit.id, cell.date))).length,
    0,
  );
  const monthRate = scheduledCount > 0 ? Math.round((completedCount / scheduledCount) * 100) : 0;
  const streaks = habits.map((habit) => ({ habit, ...calculateHabitStreak(habit, logs, today) }));
  const strongestStreak = streaks.reduce((max, item) => Math.max(max, item.current), 0);

  async function changeMonth(nextMonth: string) {
    setLoading(true);
    setError("");
    try {
      const bounds = getMonthBounds(nextMonth);
      const earliest = habits.reduce((value, habit) => habit.createdAt.slice(0, 10) < value ? habit.createdAt.slice(0, 10) : value, bounds.start);
      const to = bounds.end > today ? bounds.end : today;
      const response = await fetch(`/api/habit-logs?from=${encodeURIComponent(earliest)}&to=${encodeURIComponent(to)}`, { cache: "no-store" });
      const data = await parseApiResponse(response, HabitLogsResponseSchema);
      setLogs(data.logs);
      setMonth(nextMonth);
      setSelectedDate(nextMonth === today.slice(0, 7) ? today : bounds.start);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "記録を読み込めませんでした。");
    } finally {
      setLoading(false);
    }
  }

  async function toggleHabit(habit: Habit) {
    const key = logKey(habit.id, selectedDate);
    const completed = !completedKeys.has(key);
    setPendingKey(key);
    setError("");
    try {
      const response = await fetch("/api/habit-logs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ habitId: habit.id, date: selectedDate, completed }),
      });
      const data = await parseApiResponse(response, HabitLogResponseSchema);
      setLogs((current) => [...current.filter((log) => logKey(log.habitId, log.date) !== key), data.log]);
      if (data.log.completed) {
        celebrationId.current += 1;
        setCelebration({
          id: celebrationId.current,
          habitName: habit.name,
          definition: pickHabitCelebration(),
        });
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "達成記録を保存できませんでした。");
    } finally {
      setPendingKey(null);
    }
  }

  if (habits.length === 0) {
    return (
      <section className="card habit-empty habit-empty-large">
        <span aria-hidden="true">◎</span>
        <strong>カレンダーに表示する項目がありません</strong>
        <p>「継続項目の管理」から、続けたいことを登録してください。</p>
        <a className="primary-button" href="/habits/manage">最初の項目を作成</a>
      </section>
    );
  }

  return (
    <>
      {celebration ? (
        <div
          className={`habit-celebration habit-celebration-${celebration.definition.animation}`}
          key={celebration.id}
          role="status"
          aria-live="polite"
        >
          <CelebrationEffect animation={celebration.definition.animation} />
          <div className="habit-celebration-toast">
            <span className="habit-celebration-icon" aria-hidden="true">{celebration.definition.icon}</span>
            <div>
              <small>TASK COMPLETE</small>
              <strong>{celebration.definition.message}</strong>
              <p>{celebration.habitName}</p>
            </div>
          </div>
        </div>
      ) : null}
      <section className="habit-summary-grid" aria-label="今月の継続状況">
        <article className="card habit-summary-card">
          <span>今月の達成率</span>
          <strong>{monthRate}<small>%</small></strong>
          <p>{completedCount} / {scheduledCount} 回</p>
        </article>
        <article className="card habit-summary-card">
          <span>継続中の項目</span>
          <strong>{habits.length}<small>件</small></strong>
          <p>休止中の項目は除外</p>
        </article>
        <article className="card habit-summary-card highlight">
          <span>最長の現在記録</span>
          <strong>{strongestStreak}<small>回連続</small></strong>
          <p>対象曜日だけで集計</p>
        </article>
      </section>

      <div className="habit-log-layout">
        <section className="card habit-calendar-card">
          <div className="habit-calendar-head">
            <div>
              <p className="eyebrow">MONTHLY TRACKER</p>
              <h2>{monthTitle(month)}</h2>
            </div>
            <div className="habit-calendar-actions">
              <button aria-label="前月" className="ghost-button" disabled={loading} onClick={() => void changeMonth(shiftMonth(month, -1))}>←</button>
              <button className="ghost-button" disabled={loading || month === today.slice(0, 7)} onClick={() => void changeMonth(today.slice(0, 7))}>今月</button>
              <button aria-label="翌月" className="ghost-button" disabled={loading} onClick={() => void changeMonth(shiftMonth(month, 1))}>→</button>
            </div>
          </div>
          {error ? <p className="habit-form-message error" role="alert">{error}</p> : null}
          <div className={`habit-calendar ${loading ? "loading" : ""}`}>
            {WEEKDAYS.map((weekday) => <div className="habit-weekday" key={weekday}>{weekday}</div>)}
            {calendar.map((cell) => {
              const scheduled = habits.filter((habit) => isHabitScheduled(habit, cell.date));
              const done = scheduled.filter((habit) => completedKeys.has(logKey(habit.id, cell.date))).length;
              const disabled = cell.date > today;
              return (
                <button
                  aria-label={`${formatJapaneseDate(cell.date)} ${done}/${scheduled.length}件達成`}
                  className={[
                    "habit-day",
                    cell.inMonth ? "" : "outside",
                    cell.date === today ? "today" : "",
                    cell.date === selectedDate ? "selected" : "",
                  ].filter(Boolean).join(" ")}
                  disabled={disabled}
                  key={cell.date}
                  onClick={() => setSelectedDate(cell.date)}
                >
                  <span className="habit-day-number">{Number(cell.date.slice(-2))}</span>
                  <span className="habit-day-marks">
                    {scheduled.slice(0, 5).map((habit) => (
                      <i
                        className={`${habit.color} ${completedKeys.has(logKey(habit.id, cell.date)) ? "completed" : ""}`}
                        key={habit.id}
                        title={habit.name}
                      />
                    ))}
                  </span>
                  {scheduled.length > 0 ? <span className="habit-day-count">{done}/{scheduled.length}</span> : null}
                </button>
              );
            })}
          </div>
        </section>

        <aside className="habit-side-column">
          <section className="card habit-day-panel">
            <div className="habit-day-panel-head">
              <div>
                <p className="eyebrow">DAILY CHECK</p>
                <h2>{formatJapaneseDate(selectedDate)}</h2>
              </div>
              {selectedDate === today ? <span className="habit-today-badge">今日</span> : null}
            </div>
            {selectedDate > today ? (
              <p className="habit-day-empty">未来の日付は、当日になってから記録できます。</p>
            ) : selectedHabits.length === 0 ? (
              <p className="habit-day-empty">この日に予定している継続項目はありません。</p>
            ) : (
              <div className="habit-check-list">
                {selectedHabits.map((habit) => {
                  const key = logKey(habit.id, selectedDate);
                  const completed = completedKeys.has(key);
                  return (
                    <button
                      className={`habit-check ${completed ? "completed" : ""}`}
                      disabled={pendingKey === key}
                      key={habit.id}
                      onClick={() => void toggleHabit(habit)}
                    >
                      <span className={`habit-check-box ${habit.color}`}>{completed ? "✓" : ""}</span>
                      <span>
                        <strong>{habit.name}</strong>
                        <small>{habit.note || `${formatTargetDays(habit.targetDays)}に実行`}</small>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          <section className="card habit-streak-panel">
            <div className="habit-section-heading">
              <div>
                <p className="eyebrow">STREAKS</p>
                <h2>継続記録</h2>
              </div>
            </div>
            <div className="habit-streak-list">
              {streaks.map(({ habit, current, longest }) => (
                <div className="habit-streak-item" key={habit.id}>
                  <span className={`habit-color-dot ${habit.color}`} aria-hidden="true" />
                  <div>
                    <strong>{habit.name}</strong>
                    <small>{formatTargetDays(habit.targetDays)}</small>
                  </div>
                  <p><strong>{current}</strong> 回連続<span>最長 {longest}回</span></p>
                </div>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </>
  );
}
