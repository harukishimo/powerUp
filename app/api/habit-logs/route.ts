import { NextResponse } from "next/server";
import { accessError, errorResponse, readJsonBody, RequestBodyTooLargeError, requestId } from "@/lib/http";
import { getTodayJst, isValidDateString, shiftDate } from "@/lib/date";
import { getStorage } from "@/lib/storage";
import { HabitLogInputSchema } from "@/lib/validation";

export const runtime = "nodejs";

function validDate(value: string | null): value is string {
  return Boolean(value && isValidDateString(value));
}

export async function GET(request: Request) {
  const id = requestId();
  const denied = await accessError(id);
  if (denied) return denied;
  try {
    const url = new URL(request.url);
    const to = validDate(url.searchParams.get("to")) ? url.searchParams.get("to")! : getTodayJst();
    const from = validDate(url.searchParams.get("from")) ? url.searchParams.get("from")! : shiftDate(to, -30);
    if (from > to) {
      return NextResponse.json({ error: "日付範囲が正しくありません。", requestId: id }, { status: 400 });
    }
    const logs = await getStorage().listHabitLogs(from, to);
    return NextResponse.json({ logs, range: { from, to } }, { headers: { "x-request-id": id, "cache-control": "no-store" } });
  } catch (error) {
    return errorResponse(error, id);
  }
}

export async function POST(request: Request) {
  const id = requestId();
  const denied = await accessError(id);
  if (denied) return denied;
  try {
    const input = HabitLogInputSchema.parse(await readJsonBody(request));
    const storage = getStorage();
    const habit = (await storage.listHabits(true)).find((candidate) => candidate.id === input.habitId);
    if (!habit) return NextResponse.json({ error: "継続項目が見つかりません。", requestId: id }, { status: 404 });
    if (input.date < habit.createdAt.slice(0, 10)) {
      return NextResponse.json({ error: "継続項目を作成する前の日付は記録できません。", requestId: id }, { status: 400 });
    }
    const log = await storage.upsertHabitLog(input.habitId, input.date, input.completed);
    return NextResponse.json({ log }, { headers: { "x-request-id": id, "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof SyntaxError) return NextResponse.json({ error: "JSON形式が正しくありません。", requestId: id }, { status: 400 });
    if (error instanceof RequestBodyTooLargeError) return NextResponse.json({ error: "入力が大きすぎます。", requestId: id }, { status: 413 });
    if (error && typeof error === "object" && "issues" in error) {
      return NextResponse.json({ error: "達成記録の入力内容を確認してください。", requestId: id }, { status: 400 });
    }
    return errorResponse(error, id);
  }
}
