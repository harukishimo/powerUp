import type { DailyLog, TimelineEvent } from "@/types/domain";

export const JAPAN_TIME_ZONE = "Asia/Tokyo" as const;

const japanDateTimeFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: JAPAN_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function dateTimeParts(value: Date) {
  return Object.fromEntries(
    japanDateTimeFormatter.formatToParts(value)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  ) as Record<string, string>;
}

export function formatJstTime(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = dateTimeParts(date);
  return `${parts.hour}:${parts.minute}`;
}

export function formatJstIso(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = dateTimeParts(date);
  const milliseconds = String(date.getMilliseconds()).padStart(3, "0");
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}.${milliseconds}+09:00`;
}

export function nowJstIso() {
  return formatJstIso(new Date())!;
}

function convertLegacyTimelineTime(date: string, time: string) {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return time;
  const legacyUtc = new Date(`${date}T${time}:00.000Z`);
  return formatJstTime(legacyUtc) ?? time;
}

/** 旧実装がUTCのまま保存した「日次ログを保存」イベントをJSTへ変換する。 */
export function normalizeTimelineEvents(date: string, timeline: TimelineEvent[]) {
  return timeline.map((event) => {
    if (event.timeZone === JAPAN_TIME_ZONE || event.label !== "日次ログを保存") return event;
    return {
      ...event,
      time: convertLegacyTimelineTime(date, event.time),
      timeZone: JAPAN_TIME_ZONE,
    };
  });
}

/** 保存済みログを表示・再保存可能な日本時間表現へ正規化する。 */
export function normalizeLogTimestamps(log: DailyLog): DailyLog {
  return {
    ...log,
    createdAt: formatJstIso(log.createdAt) ?? log.createdAt,
    updatedAt: formatJstIso(log.updatedAt) ?? log.updatedAt,
    timeline: normalizeTimelineEvents(log.date, log.timeline),
  };
}

export function isValidDateString(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function getTodayJst() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: JAPAN_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function getCurrentTimeJst() {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: JAPAN_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date());
}

export function shiftDate(date: string, days: number) {
  const value = new Date(`${date}T00:00:00+09:00`);
  value.setUTCDate(value.getUTCDate() + days);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: JAPAN_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
}

export function formatJapaneseDate(date: string) {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: JAPAN_TIME_ZONE,
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(new Date(`${date}T12:00:00+09:00`));
}
