"use client";

import { type FormEvent, useState } from "react";
import { parseApiResponse } from "@/lib/client-api";
import { formatTargetDays } from "@/lib/habits";
import { HabitResponseSchema } from "@/lib/validation";
import type { Habit, HabitColor, HabitInput } from "@/types/domain";

const DAY_OPTIONS = [
  { value: 1, label: "月" },
  { value: 2, label: "火" },
  { value: 3, label: "水" },
  { value: 4, label: "木" },
  { value: 5, label: "金" },
  { value: 6, label: "土" },
  { value: 0, label: "日" },
];

const COLORS: Array<{ value: HabitColor; label: string }> = [
  { value: "violet", label: "紫" },
  { value: "mint", label: "緑" },
  { value: "blue", label: "青" },
  { value: "orange", label: "橙" },
  { value: "rose", label: "赤" },
];

const EMPTY_FORM: HabitInput = {
  name: "",
  note: "",
  color: "violet",
  targetDays: [0, 1, 2, 3, 4, 5, 6],
  active: true,
};

function sortHabits(habits: Habit[]) {
  return [...habits].sort((a, b) => Number(b.active) - Number(a.active) || a.createdAt.localeCompare(b.createdAt));
}

export function HabitMaster({ initialHabits }: { initialHabits: Habit[] }) {
  const [habits, setHabits] = useState(() => sortHabits(initialHabits));
  const [form, setForm] = useState<HabitInput>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  function resetForm() {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setMessage("");
    setError("");
  }

  function setTargetDay(day: number, checked: boolean) {
    setForm((current) => ({
      ...current,
      targetDays: checked
        ? [...new Set([...current.targetDays, day])].sort((a, b) => a - b)
        : current.targetDays.filter((value) => value !== day),
    }));
  }

  async function saveHabit(input: HabitInput, id?: string) {
    const response = await fetch(id ? `/api/habits/${encodeURIComponent(id)}` : "/api/habits", {
      method: id ? "PATCH" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
    return parseApiResponse(response, HabitResponseSchema);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    if (form.targetDays.length === 0) {
      setError("実行する曜日を1つ以上選択してください。");
      return;
    }
    setSaving(true);
    try {
      const { habit } = await saveHabit(form, editingId ?? undefined);
      setHabits((current) => sortHabits([...current.filter((item) => item.id !== habit.id), habit]));
      setForm(EMPTY_FORM);
      setEditingId(null);
      setMessage(editingId ? "継続項目を更新しました。" : "継続項目を追加しました。");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "保存できませんでした。");
    } finally {
      setSaving(false);
    }
  }

  function startEditing(habit: Habit) {
    setEditingId(habit.id);
    setForm({
      name: habit.name,
      note: habit.note,
      color: habit.color,
      targetDays: [...habit.targetDays],
      active: habit.active,
    });
    setMessage("");
    setError("");
    document.getElementById("habit-editor")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function toggleActive(habit: Habit) {
    setUpdatingId(habit.id);
    setError("");
    setMessage("");
    try {
      const { habit: updated } = await saveHabit({
        name: habit.name,
        note: habit.note,
        color: habit.color,
        targetDays: habit.targetDays,
        active: !habit.active,
      }, habit.id);
      setHabits((current) => sortHabits([...current.filter((item) => item.id !== updated.id), updated]));
      setMessage(updated.active ? "継続項目を再開しました。" : "継続項目を休止しました。過去の記録は保持されます。");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "更新できませんでした。");
    } finally {
      setUpdatingId(null);
    }
  }

  return (
    <div className="habit-manage-layout">
      <section className="card habit-editor-card" id="habit-editor">
        <div className="habit-section-heading">
          <div>
            <p className="eyebrow">{editingId ? "EDIT HABIT" : "NEW HABIT"}</p>
            <h2>{editingId ? "継続項目を編集" : "新しい継続項目"}</h2>
            <p>小さく、実行したか判断しやすい内容にします。</p>
          </div>
          {editingId ? <button className="ghost-button" type="button" onClick={resetForm}>編集をやめる</button> : null}
        </div>
        <form onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="habit-name">継続する事柄</label>
            <input
              id="habit-name"
              maxLength={60}
              placeholder="例：朝に10分散歩する"
              required
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
            />
          </div>
          <div className="field">
            <label htmlFor="habit-note">メモ（任意）</label>
            <textarea
              id="habit-note"
              maxLength={240}
              placeholder="実行するタイミングや、できたと判断する基準"
              value={form.note}
              onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))}
            />
          </div>
          <fieldset className="habit-fieldset">
            <legend>実行する曜日</legend>
            <div className="habit-days">
              {DAY_OPTIONS.map((day) => (
                <label key={day.value}>
                  <input
                    type="checkbox"
                    checked={form.targetDays.includes(day.value)}
                    onChange={(event) => setTargetDay(day.value, event.target.checked)}
                  />
                  <span>{day.label}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset className="habit-fieldset">
            <legend>表示色</legend>
            <div className="habit-colors">
              {COLORS.map((color) => (
                <label key={color.value} title={color.label}>
                  <input
                    type="radio"
                    name="habit-color"
                    value={color.value}
                    checked={form.color === color.value}
                    onChange={() => setForm((current) => ({ ...current, color: color.value }))}
                  />
                  <span className={`habit-color-dot ${color.value}`} />
                </label>
              ))}
            </div>
          </fieldset>
          {message ? <p className="habit-form-message success" role="status">{message}</p> : null}
          {error ? <p className="habit-form-message error" role="alert">{error}</p> : null}
          <button className="primary-button full-button" disabled={saving} type="submit">
            {saving ? "保存中…" : editingId ? "変更を保存" : "継続項目を追加"}
          </button>
        </form>
      </section>

      <section className="habit-master-list">
        <div className="habit-section-heading">
          <div>
            <p className="eyebrow">HABIT MASTER</p>
            <h2>登録済みの項目</h2>
            <p>{habits.filter((habit) => habit.active).length}件を継続中</p>
          </div>
        </div>
        {habits.length === 0 ? (
          <div className="card habit-empty">
            <span aria-hidden="true">◎</span>
            <strong>まだ継続項目がありません</strong>
            <p>最初は、毎日5分で終わることから始めるのがおすすめです。</p>
          </div>
        ) : (
          <div className="habit-master-cards">
            {habits.map((habit) => (
              <article className={`card habit-master-card ${habit.active ? "" : "inactive"}`} key={habit.id}>
                <div className={`habit-color-bar ${habit.color}`} />
                <div className="habit-master-copy">
                  <div className="habit-master-title">
                    <span className={`habit-color-dot ${habit.color}`} aria-hidden="true" />
                    <h3>{habit.name}</h3>
                    <span className={`habit-status ${habit.active ? "active" : ""}`}>{habit.active ? "継続中" : "休止中"}</span>
                  </div>
                  <p>{habit.note || "メモはありません。"}</p>
                  <span className="habit-schedule">実行日：{formatTargetDays(habit.targetDays)}</span>
                </div>
                <div className="habit-master-actions">
                  <button className="ghost-button" type="button" onClick={() => startEditing(habit)}>編集</button>
                  <button
                    className="ghost-button"
                    disabled={updatingId === habit.id}
                    type="button"
                    onClick={() => void toggleActive(habit)}
                  >
                    {updatingId === habit.id ? "更新中…" : habit.active ? "休止" : "再開"}
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
