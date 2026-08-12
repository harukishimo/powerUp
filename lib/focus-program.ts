import { shiftDate } from "@/lib/date";
import type { FocusDailyLog, FocusDailyLogInput, FocusMetrics, FocusUrgeTrigger } from "@/types/domain";

export const FOCUS_PROGRAM_START = "2026-08-12";
export const FOCUS_PROGRAM_DAYS = 14;
export const FOCUS_PROGRAM_END = shiftDate(FOCUS_PROGRAM_START, FOCUS_PROGRAM_DAYS - 1);

export interface FocusProgramDay {
  day: number;
  date: string;
  title: string;
  description: string;
  target: string;
  actions: Array<{ id: string; label: string; detail?: string }>;
}

const DAY_DEFINITIONS: Array<Omit<FocusProgramDay, "day" | "date">> = [
  {
    title: "誘惑を消す環境をつくる",
    description: "PC版YouTubeを、目的の動画だけを見る道具へ近づけます。今日はベースラインも残します。",
    target: "意志力ではなく、YouTubeへ到達する導線そのものを変える",
    actions: [
      { id: "install-unhook", label: "Unhookを導入する" },
      { id: "configure-unhook", label: "おすすめ・Shorts・自動再生などを非表示にする" },
      { id: "install-stayfocusd", label: "StayFocusdを導入する" },
      { id: "separate-profile", label: "仕事用と娯楽用のブラウザProfileを分ける" },
      { id: "baseline", label: "今日の4指標を記録する", detail: "無目的起動、仕事中視聴、Shorts、仕事開始までの時間" },
    ],
  },
  {
    title: "朝60分を守る",
    description: "仕事開始後の最初の60分はYouTubeを開かず、最初の仕事を5分だけ始めます。",
    target: "集中し切ることではなく、YouTubeなしで仕事を開始する",
    actions: [
      { id: "write-first-task", label: "今日最初にやることを1つ書く" },
      { id: "block-60", label: "仕事開始後60分、YouTubeを開かない" },
      { id: "start-5", label: "最初の仕事を5分だけ始める" },
    ],
  },
  {
    title: "欲求のトリガーを見つける",
    description: "YouTubeを開きたくなった瞬間に、直前の状況を記録します。",
    target: "「認知負荷 → YouTube」の自動反応に気づく",
    actions: [
      { id: "record-urge", label: "欲求を感じた瞬間を1回以上記録する" },
      { id: "name-trigger", label: "分からない・面倒・疲れなどのトリガーを選ぶ" },
      { id: "review-route", label: "どの導線で開こうとしたか振り返る" },
    ],
  },
  {
    title: "5分開始ルール",
    description: "YouTubeを開きたくなったら、今の仕事を5分だけ進めてからもう一度判断します。",
    target: "「負荷 → YouTube」を「負荷 → 5分作業」へ置き換える",
    actions: [
      { id: "notice-urge", label: "欲求に気づいたら言葉にする" },
      { id: "work-5", label: "今の仕事を5分だけ続ける" },
      { id: "decide-again", label: "5分後に視聴が本当に必要か判断し直す" },
    ],
  },
  {
    title: "目的を1行書く",
    description: "YouTubeを開く前に、何を見るのかを1行で記録します。",
    target: "「なんとなく開く」を止め、目的視聴へ切り替える",
    actions: [
      { id: "write-purpose", label: "YouTubeを開く前に目的を記録する" },
      { id: "search-direct", label: "トップ画面を眺めず目的の動画へ直接移動する" },
      { id: "close-tab", label: "見終わったらトップへ戻らずタブを閉じる" },
    ],
  },
  {
    title: "休憩とYouTubeを分ける",
    description: "仕事中の休憩は、水・散歩・ストレッチなど低刺激の行動にします。",
    target: "「休憩＝高刺激コンテンツ」という結びつきを弱める",
    actions: [
      { id: "choose-break", label: "低刺激の休憩を1つ選ぶ" },
      { id: "break-no-video", label: "10分休憩でYouTube・Shorts・SNSを見ない" },
      { id: "return-after-break", label: "休憩後に次の作業へ戻る" },
    ],
  },
  {
    title: "1週目レビュー",
    description: "Day1と比べ、減ったことと戻れた場面を確認します。ゼロは要求しません。",
    target: "無目的起動や仕事中視聴が30〜50％減ったかを見る",
    actions: [
      { id: "fill-metrics", label: "今日の指標を入力する" },
      { id: "compare-baseline", label: "Day1との変化を確認する" },
      { id: "choose-friction", label: "来週追加する摩擦を1つ決める" },
    ],
  },
  {
    title: "朝90分へ伸ばす",
    description: "仕事開始後のYouTube禁止時間を90分へ延長します。",
    target: "高負荷な作業の入口をYouTubeから切り離す",
    actions: [
      { id: "write-first-task", label: "今日最初にやることを1つ書く" },
      { id: "block-90", label: "仕事開始後90分、YouTubeを開かない" },
      { id: "docs-first", label: "調査は公式Docs・検索・AIを先に使う" },
    ],
  },
  {
    title: "10分遅らせる",
    description: "見たい欲求が出ても禁止せず、「10分後なら見てよい」と遅延します。",
    target: "反射的に開く前に、選択する時間をつくる",
    actions: [
      { id: "delay-10", label: "欲求が出たら10分待つ" },
      { id: "work-during-delay", label: "待つ間に今の作業を少し進める" },
      { id: "reconsider", label: "10分後に必要性を判断し直す" },
    ],
  },
  {
    title: "45分集中を2セット",
    description: "45分作業、10分の低刺激休憩、45分作業を行います。",
    target: "90分の集中時間を、回復を挟みながら確保する",
    actions: [
      { id: "focus-45-first", label: "45分作業する" },
      { id: "low-break-10", label: "10分の低刺激休憩を取る" },
      { id: "focus-45-second", label: "もう45分作業する" },
    ],
  },
  {
    title: "無刺激休憩を試す",
    description: "10分間、スマホ・動画・Podcast・SNSなしで休みます。散歩はOKです。",
    target: "何も摂取していない時間への耐性を育てる",
    actions: [
      { id: "quiet-break", label: "10分の無刺激休憩を取る" },
      { id: "no-phone", label: "休憩中はスマホを触らない" },
      { id: "notice-feeling", label: "退屈さや落ち着き方を振り返る" },
    ],
  },
  {
    title: "開いたあとに戻る",
    description: "無意識にYouTubeを開いても、気づいて閉じ、5分仕事へ戻れれば成功です。",
    target: "All-or-Nothingを避け、復帰行動を強くする",
    actions: [
      { id: "name-escape", label: "開いたら「あ、逃げた」と認識する" },
      { id: "close-youtube", label: "YouTubeのタブを閉じる" },
      { id: "return-5", label: "5分だけ仕事へ戻る" },
    ],
  },
  {
    title: "補助輪を一部外す",
    description: "45分だけ強制ブロックを外し、Unhookは残したまま自力で選択します。",
    target: "環境支援を残しつつ、自分で戻る練習をする",
    actions: [
      { id: "disable-block-45", label: "強制ブロックを45分だけOFFにする" },
      { id: "keep-unhook", label: "UnhookはONのままにする" },
      { id: "record-urge", label: "欲求が出たら記録し、自力で作業へ戻る" },
    ],
  },
  {
    title: "14日間を評価する",
    description: "Day1と比較し、YouTubeを自分の意思で使える状態へ近づいたかを確認します。",
    target: "無目的起動50％減、仕事中30分未満、Shorts 0分、復帰3回以上",
    actions: [
      { id: "fill-final-metrics", label: "最終日の指標を入力する" },
      { id: "compare-day1", label: "Day1との変化を確認する" },
      { id: "review-loop", label: "「面倒 → 気づく → 5分仕事」に変わったか振り返る" },
      { id: "next-step", label: "今後も残す環境対策を決める" },
    ],
  },
];

export const FOCUS_PROGRAM = DAY_DEFINITIONS.map((definition, index): FocusProgramDay => ({
  ...definition,
  day: index + 1,
  date: shiftDate(FOCUS_PROGRAM_START, index),
}));

export const FOCUS_ENVIRONMENT_CHECKS = [
  { id: "homepage-feed", label: "Homepage Feedを非表示" },
  { id: "video-sidebar", label: "Video Sidebarを非表示" },
  { id: "recommended", label: "Recommendedを非表示" },
  { id: "shorts", label: "YouTube Shortsを非表示" },
  { id: "end-videowall", label: "終了画面のVideowallを非表示" },
  { id: "end-cards", label: "終了画面のCardsを非表示" },
  { id: "comments", label: "Commentsを非表示" },
  { id: "autoplay", label: "Autoplayを無効化" },
  { id: "explore", label: "Explore / Trendingを非表示" },
  { id: "stayfocusd", label: "StayFocusdを有効化" },
  { id: "remove-shortcuts", label: "ブックマーク・新規タブの導線を削除" },
  { id: "separate-profile", label: "仕事用 / 娯楽用Profileを分離" },
] as const;

export const FOCUS_TRIGGER_LABELS: Record<FocusUrgeTrigger, string> = {
  unclear: "何をすればよいか分からない",
  difficult: "難しい・原因が分からない",
  tedious: "面倒・退屈",
  tired: "疲れた",
  sleepy: "眠い",
  "after-task": "一仕事終わった",
  "task-switch": "タスク切り替え直後",
  anxious: "不安・成果がすぐ出ない",
  other: "その他",
};

export function emptyFocusMetrics(): FocusMetrics {
  return {
    aimlessOpenCount: null,
    workYoutubeMinutes: null,
    shortsMinutes: null,
    workStartDelayMinutes: null,
    recognizedUrges: null,
    returnedToWorkCount: null,
  };
}

export function createBlankFocusLog(date: string, environmentCheckIds: string[] = []): FocusDailyLogInput {
  return {
    date,
    firstTask: "",
    completedActionIds: [],
    environmentCheckIds,
    metrics: emptyFocusMetrics(),
    urgeEvents: [],
    purposeEntries: [],
    reflection: "",
  };
}

export function getFocusProgramDay(date: string) {
  return FOCUS_PROGRAM.find((day) => day.date === date) ?? null;
}

export function isFocusDayComplete(log: FocusDailyLog | FocusDailyLogInput | undefined, day: FocusProgramDay) {
  if (!log) return false;
  return day.actions.every((action) => log.completedActionIds.includes(action.id));
}

export function metricReduction(baseline: number | null, current: number | null) {
  if (baseline === null || current === null || baseline <= 0) return null;
  return Math.round(((baseline - current) / baseline) * 100);
}

export function latestEnvironmentChecks(logs: FocusDailyLog[]) {
  return [...logs]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .find((log) => log.environmentCheckIds.length > 0)?.environmentCheckIds ?? [];
}
