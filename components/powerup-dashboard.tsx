"use client";

import Link from "next/link";
import { useMemo, useRef, useState, type ReactNode } from "react";
import { LogReview } from "@/components/log-review";
import { parseApiResponse } from "@/lib/client-api";
import { buildWeeklyTrend } from "@/lib/trend";
import {
  calculateEstimatedPerformance,
  calculateMealPoints,
  calculateScores,
  SCORE_MAX,
  SCORE_VERSION,
} from "@/lib/scoring";
import { DailyLogInputSchema, AiScoreResponseSchema, SaveLogResponseSchema } from "@/lib/validation";
import type { DailyLog, DailyLogInput, DailyLogSummary, FoodLevel, MealFeature, MealInput, MealType, PortionLevel, SnackInput } from "@/types/domain";

const mealNames: Record<MealType, string> = { breakfast: "朝食", lunch: "昼食", dinner: "夕食" };
const featureLabels: Record<Exclude<MealFeature, "normal">, string> = { noodle: "麺類", fried: "揚げ物", "eating-out": "外食", "double-staple": "主食の重ね食い" };
const estimateInputLabels = { sleep: "睡眠", food: "食事", phone: "デジタル" } as const;

function blankMeal(type: MealType): MealInput {
  return { type, eatenAt: null, carbohydrateLevel: null, proteinLevel: null, vegetableLevel: null, portionLevel: null, drinkType: null, features: ["normal"], walkMinutes: null, postMealSleepiness: null };
}

function blankSnack(date: string): SnackInput {
  return { id: `${date}-snack-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, eatenAt: null, occurred: true, category: null, amountLevel: null, planned: null, beforeBed: null, note: "" };
}

function inputFromLog(log: DailyLog): DailyLogInput {
  return {
    date: log.date,
    sleep: log.sleep,
    mealTiming: log.mealTiming,
    meals: (["breakfast", "lunch", "dinner"] as MealType[]).map((type) => log.meals.find((meal) => meal.type === type) ?? blankMeal(type)),
    snacks: log.snacks,
    snackRecorded: log.snackRecorded,
    phone: log.phone,
    result: log.result,
    aiInsight: log.aiInsight ?? null,
    scoreVersion: SCORE_VERSION,
  };
}

function summaryFromLog(log: DailyLog): DailyLogSummary {
  return { date: log.date, totalScore: log.scores.total, recordingRate: log.scores.recordingRate, scores: { sleep: log.scores.sleep, food: log.scores.food, phone: log.scores.phone, result: log.scores.result }, status: log.status };
}

function displayScore(value: number | null, max: number) {
  return value === null ? "未記録" : `${value} / ${max}`;
}

export function PowerUpDashboard({ initialLog, initialSummaries, configurationWarning = false }: { initialLog: DailyLog; initialSummaries: DailyLogSummary[]; configurationWarning?: boolean }) {
  const [input, setInput] = useState<DailyLogInput>(() => inputFromLog(initialLog));
  const [summaries, setSummaries] = useState(initialSummaries);
  const [aiInsight, setAiInsight] = useState(initialLog.aiInsight ?? null);
  const [aiLoading, setAiLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const pendingRequestId = useRef<string | undefined>(undefined);
  const scores = useMemo(() => calculateScores({ ...input, aiInsight }), [input, aiInsight]);
  const estimate = useMemo(
    () => calculateEstimatedPerformance({ ...input, aiInsight }),
    [input, aiInsight],
  );

  function updateInput(patch: Partial<DailyLogInput>) {
    setInput((current) => ({ ...current, ...patch }));
    setMessage("");
    setError("");
  }

  function updateMeal(type: MealType, patch: Partial<MealInput>) {
    setInput((current) => ({ ...current, meals: current.meals.map((meal) => meal.type === type ? { ...meal, ...patch } : meal) }));
    setMessage("");
    setError("");
  }

  function updateSnack(index: number, patch: Partial<SnackInput>) {
    setInput((current) => ({ ...current, snacks: current.snacks.map((snack, snackIndex) => snackIndex === index ? { ...snack, ...patch } : snack) }));
    setMessage("");
    setError("");
  }

  async function save() {
    if (saving) return;
    setSaving(true); setMessage(""); setError("");
    const validation = DailyLogInputSchema.safeParse(input);
    if (!validation.success) {
      setSaving(false);
      setError("入力内容を確認してください。数値の範囲や必須項目を見直してください。");
      return;
    }
    const clientRequestId = pendingRequestId.current ?? `web-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    pendingRequestId.current = clientRequestId;
    try {
      const response = await fetch("/api/logs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...input, aiInsight: aiInsight?.confirmed ? aiInsight : null, clientRequestId }) });
      const data = await parseApiResponse(response, SaveLogResponseSchema);
      pendingRequestId.current = undefined;
      setInput(inputFromLog(data.log)); setAiInsight(data.log.aiInsight ?? null); setSummaries((current) => [summaryFromLog(data.log), ...current.filter((item) => item.date !== data.log.date)].sort((a, b) => b.date.localeCompare(a.date)));
      setMessage("保存しました");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "保存できませんでした。入力は保持されています。");
    } finally { setSaving(false); }
  }

  async function askGemini() {
    if (aiLoading) return;
    const hasAnalysisInput = Boolean(input.result.achievementText.trim() || input.result.focusMinutes !== null || input.result.reflectionRating !== null || scores.sleep !== null || scores.food !== null || scores.phone !== null);
    if (!hasAnalysisInput) {
      setError("Gemini採点案には、成果や記録済みの項目を1つ以上入力してください。");
      return;
    }
    setAiLoading(true); setMessage(""); setError("");
    try {
      const response = await fetch("/api/ai/score", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ date: input.date, achievementText: input.result.achievementText, reflectionRating: input.result.reflectionRating, focusMinutes: input.result.focusMinutes, foodSummary: Object.fromEntries(input.meals.map((meal) => [meal.type, meal.features.join(",")])), deterministicScores: { sleep: scores.sleep, food: scores.food, phone: scores.phone } }) });
      const data = await parseApiResponse(response, AiScoreResponseSchema);
      setAiInsight({ ...data.proposal, provider: data.provider, model: data.model, requestId: data.requestId, confirmed: false });
      setMessage(data.provider === "fallback" ? "Gemini未接続の暫定案を表示しました。" : "Geminiの採点案を表示しました。");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "AIの採点案を取得できませんでした。");
    } finally { setAiLoading(false); }
  }

  function adoptAi() {
    if (!aiInsight) return;
    updateInput({ result: { ...input.result, confirmedAchievementScore: aiInsight.achievementScore } });
    setAiInsight({ ...aiInsight, confirmed: true });
    setMessage("AIの採点案を採用しました。保存すると確定します。");
  }

  const scoreMode =
    scores.recordingRate === SCORE_MAX.total
      ? "actual"
      : estimate.score !== null
        ? "estimated"
        : scores.total !== null
          ? "provisional"
          : "missing";
  const todayScore = scoreMode === "estimated" ? estimate.score : scores.total;
  const trend = buildWeeklyTrend(summaries, input.date).map((bar) => ({
    ...bar,
    value: bar.today && todayScore !== null ? todayScore : bar.value,
    estimated: bar.today && scoreMode === "estimated",
  }));
  const scoredSummaries = summaries.filter((item) => item.totalScore !== null);
  const average = scoredSummaries.length
    ? Math.round(scoredSummaries.reduce((total, item) => total + (item.totalScore ?? 0), 0) / scoredSummaries.length)
    : 0;
  const estimateSources = estimate.inputs.map((key) => estimateInputLabels[key]).join("・");
  const scoreBadge =
    scoreMode === "estimated" ? "推定" : scoreMode === "provisional" ? "暫定" : scoreMode === "actual" ? "実績" : null;
  const scoreLabel =
    scoreMode === "missing"
      ? "条件または実績を記録しましょう"
      : scoreMode === "estimated"
        ? "現時点のコンディションからの見込みです。"
        : todayScore !== null && todayScore >= 80
          ? "良い流れです。"
          : "振り返る材料が見えてきました。";
  const scoreSubline =
    scoreMode === "estimated"
      ? `推定カバー率 ${estimate.coverage}% · ${estimateSources}から算出 · 実績ではありません`
      : scoreMode === "provisional"
        ? `成果入力カバー率 ${scores.recordingRate}% · 入力済み実績だけの暫定値`
        : scoreMode === "actual"
          ? "成果・集中・品質評価から算出した実績"
          : "未入力の項目は0点として扱いません";

  return (
    <main className="page-content">
      <div className="page-heading">
        <div><p className="eyebrow">{new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(new Date(`${input.date}T12:00:00+09:00`)).toUpperCase()}</p><h1>今日のパフォーマンス</h1><p>成果と集中を測り、睡眠・食事・デジタル環境との関係を振り返ります。</p></div>
        <div className="date-chip">◷ <span>{input.date}</span></div>
      </div>
      {configurationWarning ? <div className="warning-banner"><span aria-hidden="true">!</span><div><strong>確認用モード</strong><span>Google Sheets未接続のため、表示と保存は確認用です。Vercel環境変数を設定すると実データを保存できます。</span></div></div> : null}
      <section className="card score-hero" aria-label="今日のパフォーマンススコア">
        <div className="score-hero-main"><div className="score-hero-title"><span className="pulse-dot" /> 今日のパフォーマンススコア</div><div className="score-figure"><strong>{todayScore ?? "—"}</strong><span className="score-unit">/ 100</span>{scoreBadge ? <span className={`score-mode-badge ${scoreMode}`}>{scoreBadge}</span> : null}</div><p className="score-label">{scoreLabel}</p><p className="score-subline">{scoreSubline}</p></div>
        <div className="score-hero-chart"><div className="chart-header"><strong>直近7日間の流れ</strong><span>実績平均 <b>{scoredSummaries.length ? average : "—"}</b></span></div><div className="trend-bars">{trend.map((bar) => <div className={`trend-column ${bar.today ? "today" : ""} ${bar.estimated ? "estimated" : ""} ${bar.value === null ? "missing" : ""}`} key={bar.label}><div className="trend-bar" style={{ height: bar.value === null || bar.value === 0 ? "0px" : `${Math.max(7, (bar.value / 100) * 80)}px` }} /><span>{bar.label}</span></div>)}</div><div className="trend-average"><span>{scoreMode === "estimated" ? "斜線の今日スコアは推定値で、実績平均には含みません。" : "今日の実績を記録すると、傾向を比較できます。"}</span></div></div>
      </section>
      <div className="metric-grid">
        <MetricCard icon="◒" tone="sleep" title="睡眠コンディション" value={displayScore(scores.sleep, SCORE_MAX.sleep)} meta={input.sleep.pixelWatchScore === null ? "Pixel Watchスコアを入力" : `デバイススコア ${input.sleep.pixelWatchScore}`} score={scores.sleep} max={SCORE_MAX.sleep} />
        <MetricCard icon="◌" tone="food" title="食事行動" value={displayScore(scores.food, SCORE_MAX.food)} meta={`${input.meals.filter((meal) => meal.eatenAt).length}食 · 間食 ${input.snackRecorded ? "記録済み" : "未記録"}`} score={scores.food} max={SCORE_MAX.food} />
        <MetricCard icon="▣" tone="phone" title="デジタル注意環境" value={displayScore(scores.phone, SCORE_MAX.phone)} meta={input.phone.entertainmentMinutes === null ? "3項目すべてを入力" : `娯楽 ${Math.floor(input.phone.entertainmentMinutes / 60)}h ${input.phone.entertainmentMinutes % 60}m`} score={scores.phone} max={SCORE_MAX.phone} />
        <MetricCard icon="↗" tone="result" title={scoreMode === "estimated" ? "推定パフォーマンス" : scoreMode === "provisional" ? "暫定パフォーマンス" : "実際のパフォーマンス"} value={displayScore(todayScore, SCORE_MAX.result)} meta={scoreMode === "estimated" ? `入力カバー率 ${estimate.coverage}% · ${estimateSources}` : input.result.focusMinutes === null ? "成果・集中・品質を入力" : `集中 ${input.result.focusMinutes}分`} score={todayScore} max={SCORE_MAX.result} badge={scoreBadge} />
      </div>
      <div className="section-row"><div><h2>今日のログ</h2><p>入力内容を確認し、最後にまとめて保存できます。</p></div><Link className="section-link" href="/logs">ログを見る →</Link></div>
      <div className="lower-grid"><ActivityCard log={input} /><section className="card insight-card"><div className="card-heading"><div><h2>次に試すこと</h2><p>小さな実験をひとつだけ</p></div><span className="ai-badge">✦ Gemini AI insight</span></div><p className="insight-copy">{aiInsight ? <>{aiInsight.reason}<br /><em>{aiInsight.nextExperiment}</em></> : <>昨日は昼食後の眠気が強めでした。<br /><em>次回は甘い飲料を無糖のお茶に替えてみましょう。</em></>}</p><button className="insight-action" type="button" onClick={askGemini} disabled={aiLoading}>{aiLoading ? "作成中…" : "Gemini採点案を更新 →"}</button></section></div>
      <Editor input={input} scores={scores} aiInsight={aiInsight} aiLoading={aiLoading} saving={saving} message={message} error={error} updateInput={updateInput} updateMeal={updateMeal} updateSnack={updateSnack} askGemini={askGemini} adoptAi={adoptAi} save={save} />
      <LogReview summaries={summaries} initialLog={initialLog} />
    </main>
  );
}

function MetricCard({ icon, tone, title, value, meta, score, max, badge = null }: { icon: string; tone: string; title: string; value: string; meta: string; score: number | null; max: number; badge?: string | null }) {
  return <section className="card metric-card"><div className="metric-top"><span className={`metric-icon ${tone}`}>{icon}</span><span className="metric-score"><strong>{value.split(" /")[0]}</strong>{value.includes("/") ? ` / ${max}` : ""}{badge ? <span className="metric-badge">{badge}</span> : null}</span></div><h2 className="metric-title">{title}</h2><p className={`metric-meta ${score === null ? "missing-text" : ""}`}>{meta}</p><div className="metric-bar"><span className={tone} style={{ width: `${score === null ? 0 : Math.min(100, (score / max) * 100)}%` }} /></div></section>;
}

function ActivityCard({ log }: { log: DailyLogInput }) {
  const events = [
    { time: log.sleep.pixelWatchScore === null ? "—" : "08:05", label: "睡眠を記録", detail: log.sleep.pixelWatchScore === null ? "未記録" : `Pixel Watch ${log.sleep.pixelWatchScore}` },
    ...log.meals.filter((meal) => meal.eatenAt).slice(0, 2).map((meal) => ({ time: meal.eatenAt!, label: `${mealNames[meal.type]}を記録`, detail: meal.postMealSleepiness ? `眠気 ${meal.postMealSleepiness} / 5` : "食事バランスを記録" })),
    { time: log.result.focusMinutes === null ? "—" : "18:10", label: "集中作業を記録", detail: log.result.focusMinutes === null ? "未記録" : `${log.result.focusMinutes}分` },
  ];
  return <section className="card activity-card"><div className="card-heading"><div><h2>今日のアクティビティ</h2><p>記録した内容がここに並びます。</p></div><span className="date-chip">{log.date}</span></div><div className="activity-list">{events.map((event, index) => <div className="activity-item" key={`${event.time}-${index}`}><span className="activity-time">{event.time}</span><span className="activity-marker" /><div className="activity-copy"><strong>{event.label}</strong><span>{event.detail}</span></div></div>)}</div></section>;
}

type EditorProps = { input: DailyLogInput; scores: ReturnType<typeof calculateScores>; aiInsight: DailyLogInput["aiInsight"]; aiLoading: boolean; saving: boolean; message: string; error: string; updateInput: (patch: Partial<DailyLogInput>) => void; updateMeal: (type: MealType, patch: Partial<MealInput>) => void; updateSnack: (index: number, patch: Partial<SnackInput>) => void; askGemini: () => void; adoptAi: () => void; save: () => void };

function Editor({ input, scores, aiInsight, aiLoading, saving, message, error, updateInput, updateMeal, updateSnack, askGemini, adoptAi, save }: EditorProps) {
  return (
    <section className="card editor-card" id="settings">
      <div className="editor-heading">
        <div>
          <h2>記録を編集</h2>
          <p>選択式中心。Geminiが配点案をつくり、最後はあなたが確定します。</p>
        </div>
        <span className="ai-badge">Gemini API preview</span>
      </div>

      <div className="editor-section">
        <div className="editor-section-title"><span className="section-number">01</span>睡眠コンディション</div>
        <div className="input-grid two">
          <Field label="Pixel Watch 睡眠スコア">
            <input type="number" min="0" max="100" value={input.sleep.pixelWatchScore ?? ""} placeholder="0〜100" onChange={(event) => updateInput({ sleep: { ...input.sleep, pixelWatchScore: event.target.value === "" ? null : Number(event.target.value) } })} />
          </Field>
          <Field label="朝の回復感">
            <ChoiceGroup name="sleep-recovery" value={input.sleep.recoveryFeeling?.toString() ?? ""} options={["1", "2", "3", "4", "5"]} labels={["1", "2", "3", "4", "5"]} onChange={(value) => updateInput({ sleep: { ...input.sleep, recoveryFeeling: value ? Number(value) : null } })} />
            <ScaleGuide low="1 回復感なし" middle="3 普通" high="5 十分回復" />
          </Field>
        </div>
        <p className="help-text">睡眠コンディション：{scores.sleep === null ? "未記録" : `${scores.sleep} / ${SCORE_MAX.sleep}`} · パフォーマンス総合点とは分けて記録します。</p>
      </div>

      <div className="editor-section">
        <div className="editor-section-title"><span className="section-number">02</span>食事行動と間食</div>
        {(["breakfast", "lunch", "dinner"] as MealType[]).map((type) => (
          <MealEditor key={type} meal={input.meals.find((item) => item.type === type) ?? blankMeal(type)} update={(patch) => updateMeal(type, patch)} />
        ))}
        <div className="meal-panel">
          <div className="meal-panel-head">
            <strong>間食</strong>
            <span className="meal-score">{input.snackRecorded ? (scores.food === null ? "—" : "記録済み") : "未記録"}</span>
          </div>
          <div className="choice-group">
            <Choice name="snack-status" label="間食なし" checked={input.snackRecorded && input.snacks.length === 0} onChange={() => updateInput({ snackRecorded: true, snacks: [] })} />
            <Choice name="snack-status" label="間食あり" checked={input.snackRecorded && input.snacks.length > 0} onChange={() => updateInput({ snackRecorded: true, snacks: input.snacks.length ? input.snacks : [blankSnack(input.date)] })} />
            <Choice name="snack-status" label="未記録" checked={!input.snackRecorded} onChange={() => updateInput({ snackRecorded: false, snacks: [] })} />
          </div>
          {input.snackRecorded && input.snacks.length > 0 ? (
            <div className="snack-list" style={{ marginTop: 11 }}>
              {input.snacks.map((snack, index) => (
                <div className="snack-row" key={snack.id ?? `${input.date}-snack-${index}`}>
                  <div className="input-grid four">
                    <Field label="時刻">
                      <input type="time" value={snack.eatenAt ?? ""} onChange={(event) => updateSnack(index, { eatenAt: event.target.value || null })} />
                    </Field>
                    <Field label="内容">
                      <select value={snack.category ?? ""} onChange={(event) => {
                        const category = (event.target.value || null) as SnackInput["category"];
                        updateSnack(index, { category, planned: category === "planned-meal" ? snack.planned : null });
                      }}>
                        <option value="">選択</option>
                        <option value="healthy-small">ナッツ・ヨーグルト・果物</option>
                        <option value="planned-meal">計画した補食</option>
                        <option value="sweet-only">菓子・甘い飲料</option>
                        {snack.category === "large-or-late" ? <option value="large-or-late">旧記録：大量・就寝前</option> : null}
                      </select>
                    </Field>
                    <Field label="量">
                      <select value={snack.amountLevel ?? ""} onChange={(event) => updateSnack(index, { amountLevel: (event.target.value || null) as SnackInput["amountLevel"] })}>
                        <option value="">選択</option>
                        <option value="small">少量</option>
                        <option value="medium">普通</option>
                        <option value="large">多い</option>
                      </select>
                    </Field>
                    <Field label="メモ">
                      <input value={snack.note} onChange={(event) => updateSnack(index, { note: event.target.value })} placeholder="任意" />
                    </Field>
                  </div>
                  <div className="input-grid two snack-context-grid">
                    {snack.category === "planned-meal" ? (
                      <Field label="事前に計画していた">
                        <BooleanChoice name={`snack-${index}-planned`} value={snack.planned} yesLabel="はい" noLabel="いいえ" onChange={(value) => updateSnack(index, { planned: value })} />
                      </Field>
                    ) : null}
                    <Field label="就寝前3時間以内">
                      <BooleanChoice name={`snack-${index}-before-bed`} value={snack.beforeBed} yesLabel="はい" noLabel="いいえ" onChange={(value) => updateSnack(index, { beforeBed: value })} />
                    </Field>
                  </div>
                  <div className="snack-actions">
                    <span className="help-text">量と就寝前を分けて記録します。</span>
                    <button className="text-button" type="button" onClick={() => updateInput({ snacks: input.snacks.filter((_, snackIndex) => snackIndex !== index) })}>削除</button>
                  </div>
                </div>
              ))}
              <button className="ghost-button" type="button" onClick={() => updateInput({ snacks: [...input.snacks, blankSnack(input.date)] })}>＋間食を追加</button>
            </div>
          ) : null}
        </div>
        <div className="meal-panel">
          <div className="meal-panel-head">
            <strong>食事の時間帯</strong>
            <span className="meal-score">{scores.food === null ? "—" : `${scores.food} / ${SCORE_MAX.food}`}</span>
          </div>
          <div className="input-grid">
            <Field label="時刻が大きく乱れなかった">
              <BooleanChoice name="meal-timing-regular" value={input.mealTiming.regular} yesLabel="できた" noLabel="できなかった" onChange={(value) => updateInput({ mealTiming: { ...input.mealTiming, regular: value } })} />
            </Field>
            <Field label="夕食が就寝直前ではない">
              <BooleanChoice name="meal-timing-dinner" value={input.mealTiming.dinnerBeforeBed} yesLabel="できた" noLabel="できなかった" onChange={(value) => updateInput({ mealTiming: { ...input.mealTiming, dinnerBeforeBed: value } })} />
            </Field>
            <Field label="空腹後に食べ過ぎなかった">
              <BooleanChoice name="meal-timing-gap" value={input.mealTiming.noLongGap} yesLabel="できた" noLabel="できなかった" onChange={(value) => updateInput({ mealTiming: { ...input.mealTiming, noLongGap: value } })} />
            </Field>
          </div>
          <p className="help-text">3項目を「できた／できなかった／未記録」で区別します。一般的な食事行動の振り返り用で、血糖値を評価するものではありません。</p>
        </div>
      </div>

      <div className="editor-section">
        <div className="editor-section-title"><span className="section-number">03</span>デジタル注意環境</div>
        <div className="input-grid">
          <Field label="娯楽利用時間（分）">
            <input type="number" min="0" max="1440" value={input.phone.entertainmentMinutes ?? ""} placeholder="例：120" onChange={(event) => updateInput({ phone: { ...input.phone, entertainmentMinutes: event.target.value === "" ? null : Number(event.target.value) } })} />
          </Field>
          <Field label="作業中の通知・確認">
            <BooleanChoice name="phone-interruptions" value={input.phone.separatedDuringWork} yesLabel="抑えた" noLabel="抑えられなかった" onChange={(value) => updateInput({ phone: { ...input.phone, separatedDuringWork: value } })} />
          </Field>
          <Field label="朝夜の利用境界">
            <BooleanChoice name="phone-boundary" value={input.phone.limitedMorningOrNightUse} yesLabel="守った" noLabel="守れなかった" onChange={(value) => updateInput({ phone: { ...input.phone, limitedMorningOrNightUse: value } })} />
          </Field>
        </div>
        <p className="help-text">デジタル注意環境：{scores.phone === null ? "3項目をすべて入力すると算出" : `${scores.phone} / ${SCORE_MAX.phone}`} · ドーパミン量を評価するものではありません。</p>
      </div>

      <div className="editor-section">
        <div className="editor-section-title"><span className="section-number">04</span>実際のパフォーマンス</div>
        <div className="field">
          <label htmlFor="achievement">今日、実際に進んだこと（1〜2文）</label>
          <textarea id="achievement" value={input.result.achievementText} maxLength={240} onChange={(event) => updateInput({ result: { ...input.result, achievementText: event.target.value } })} placeholder="例：企画書の構成を完成させ、レビュー依頼を送った。" />
        </div>
        <div className="input-grid" style={{ marginTop: 12 }}>
          <Field label="確定する成果点（0〜5）">
            <ChoiceGroup name="achievement-score" value={input.result.confirmedAchievementScore?.toString() ?? ""} options={["0", "1", "2", "3", "4", "5"]} labels={["0", "1", "2", "3", "4", "5"]} onChange={(value) => updateInput({ result: { ...input.result, confirmedAchievementScore: value ? Number(value) : null } })} />
            <ScaleGuide low="0 成果なし" middle="3 主要部分を達成" high="5 重要成果を完了・共有" />
          </Field>
          <Field label="集中作業時間（分・採点上限90分）">
            <input type="number" min="0" max="1440" value={input.result.focusMinutes ?? ""} placeholder="例：75" onChange={(event) => updateInput({ result: { ...input.result, focusMinutes: event.target.value === "" ? null : Number(event.target.value) } })} />
            <p className="field-hint">実時間はそのまま保存し、採点は90分で30点の上限です。</p>
          </Field>
          <Field label="成果の品質・効率（1〜5）">
            <ChoiceGroup name="reflection" value={input.result.reflectionRating?.toString() ?? ""} options={["1", "2", "3", "4", "5"]} labels={["1", "2", "3", "4", "5"]} onChange={(value) => updateInput({ result: { ...input.result, reflectionRating: value ? Number(value) : null } })} />
            <ScaleGuide low="1 やり直しが必要" middle="3 想定どおり" high="5 高品質かつ効率的" />
          </Field>
        </div>
        <div className="field" style={{ marginTop: 12 }}>
          <label htmlFor="comment">振り返りコメント（任意）</label>
          <input id="comment" value={input.result.comment} maxLength={240} onChange={(event) => updateInput({ result: { ...input.result, comment: event.target.value } })} placeholder="一言、二言で今日の感覚を残す" />
        </div>
        <p className="help-text">パフォーマンス：{scores.result === null ? "未記録" : `${scores.result} / ${SCORE_MAX.result}`}（成果55・集中30・品質15）</p>
      </div>

      <div className="editor-section">
        <div className="editor-section-title"><span className="section-number">✦</span>Gemini採点案</div>
        {aiInsight ? (
          <div className="ai-box">
            <div><strong>成果の提案点：<span className="proposal-score">{aiInsight.achievementScore} / 5</span></strong><p>{aiInsight.reason}<br />{aiInsight.nextExperiment}</p></div>
            <div className="ai-box-actions"><button className="small-button" type="button" onClick={adoptAi}>採用する</button><button className="ghost-button" type="button" onClick={askGemini} disabled={aiLoading}>再作成</button></div>
          </div>
        ) : (
          <div className="ai-box">
            <div><strong>入力内容から採点案を作成できます。</strong><p>Geminiは提案を出しますが、確定するのはあなたです。</p></div>
            <button className="small-button" type="button" onClick={askGemini} disabled={aiLoading}>{aiLoading ? "作成中…" : "Gemini採点案"}</button>
          </div>
        )}
      </div>

      <div className="editor-actions">
        {message ? <span className="save-message" role="status">{message}</span> : error ? <span className="error-message" role="alert">{error}</span> : <span className="save-message">パフォーマンススコア：{scores.total ?? "未確定"} / 100</span>}
        <button className="ghost-button" type="button" onClick={() => window.location.reload()}>入力を戻す</button>
        <button className="primary-button" type="button" onClick={save} disabled={saving}>{saving ? "保存しています…" : "今日のログを保存"}</button>
      </div>
    </section>
  );
}

function MealEditor({ meal, update }: { meal: MealInput; update: (patch: Partial<MealInput>) => void }) {
  const point = calculateMealPoints(meal);
  const toggleFeature = (feature: MealFeature) => update({ features: meal.features.includes(feature) ? meal.features.filter((item) => item !== feature) : [...meal.features.filter((item) => item !== "normal"), feature] });
  return <div className="meal-panel"><div className="meal-panel-head"><strong>{mealNames[meal.type]}</strong><span className="meal-score">{point === null ? "未記録" : `${point} / 5`}</span></div><div className="input-grid four"><Field label="時刻"><input type="time" value={meal.eatenAt ?? ""} onChange={(event) => update({ eatenAt: event.target.value || null })} /></Field><Field label="主食"><select value={meal.carbohydrateLevel ?? ""} onChange={(event) => update({ carbohydrateLevel: (event.target.value || null) as FoodLevel | null })}><option value="">選択</option><option value="sufficient">十分</option><option value="small">少量</option><option value="none">なし</option><option value="large">多い</option></select></Field><Field label="たんぱく質"><select value={meal.proteinLevel ?? ""} onChange={(event) => update({ proteinLevel: (event.target.value || null) as FoodLevel | null })}><option value="">選択</option><option value="sufficient">十分</option><option value="small">少量</option><option value="none">なし</option></select></Field><Field label="野菜"><select value={meal.vegetableLevel ?? ""} onChange={(event) => update({ vegetableLevel: (event.target.value || null) as FoodLevel | null })}><option value="">選択</option><option value="sufficient">十分</option><option value="small">少量</option><option value="none">なし</option></select></Field></div><div className="input-grid four" style={{ marginTop: 10 }}><Field label="量"><select value={meal.portionLevel ?? ""} onChange={(event) => update({ portionLevel: (event.target.value || null) as PortionLevel | null })}><option value="">選択</option><option value="just-right">ちょうどよい</option><option value="slightly-high">やや多い</option><option value="overeating">食べ過ぎ</option></select></Field><Field label="飲み物"><select value={meal.drinkType ?? ""} onChange={(event) => update({ drinkType: (event.target.value || null) as MealInput["drinkType"] })}><option value="">選択</option><option value="water-tea">水・お茶</option><option value="unsweetened">無糖飲料</option><option value="sweet">甘い飲料</option></select></Field><Field label="食後歩行（分）"><input type="number" min="0" max="240" value={meal.walkMinutes ?? ""} placeholder="例：10" onChange={(event) => update({ walkMinutes: event.target.value === "" ? null : Number(event.target.value) })} /></Field><Field label="食後の眠気"><select value={meal.postMealSleepiness ?? ""} onChange={(event) => update({ postMealSleepiness: event.target.value === "" ? null : Number(event.target.value) })}><option value="">未記録</option><option value="1">1：なし</option><option value="2">2</option><option value="3">3</option><option value="4">4</option><option value="5">5：強い</option></select></Field></div><div className="check-row" style={{ marginTop: 10 }}><span className="help-text" style={{ margin: 0 }}>特徴</span>{(["noodle", "fried", "eating-out", "double-staple"] as Exclude<MealFeature, "normal">[]).map((feature) => <Check key={feature} label={featureLabels[feature]} value={meal.features.includes(feature)} onChange={() => toggleFeature(feature)} />)}</div><p className="help-text">麺類・揚げ物・外食・食後の眠気は傾向分析用です。主食の重ね食いのみ食事点へ反映します。</p></div>;
}

function Field({ label, children }: { label: string; children: ReactNode }) { return <div className="field"><label>{label}</label>{children}</div>; }
function ChoiceGroup({ name, value, options, labels, onChange }: { name: string; value: string; options: string[]; labels: string[]; onChange: (value: string) => void }) { return <div className="choice-group">{options.map((option, index) => <label className="choice-label" key={option}><input type="radio" name={name} checked={value === option} onChange={() => onChange(option)} /><span>{labels[index]}</span></label>)}</div>; }
function Choice({ name, label, checked, onChange }: { name: string; label: string; checked: boolean; onChange: () => void }) { return <label className="choice-label"><input type="radio" name={name} checked={checked} onChange={onChange} /><span>{label}</span></label>; }
function BooleanChoice({ name, value, yesLabel, noLabel, onChange }: { name: string; value: boolean | null; yesLabel: string; noLabel: string; onChange: (value: boolean | null) => void }) {
  return <ChoiceGroup name={name} value={value === null ? "missing" : value ? "yes" : "no"} options={["yes", "no", "missing"]} labels={[yesLabel, noLabel, "未記録"]} onChange={(next) => onChange(next === "missing" ? null : next === "yes")} />;
}
function ScaleGuide({ low, middle, high }: { low: string; middle: string; high: string }) {
  return <div className="scale-guide"><span>{low}</span><span>{middle}</span><span>{high}</span></div>;
}
function Check({ label, value, onChange }: { label: string; value: boolean | null; onChange: (value: boolean) => void }) { return <label className="check-label"><input type="checkbox" checked={value === true} onChange={(event) => onChange(event.target.checked)} />{label}</label>; }
