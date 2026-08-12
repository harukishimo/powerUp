import { NextResponse } from "next/server";
import { accessError, errorResponse, readJsonBody, RequestBodyTooLargeError, requestId } from "@/lib/http";
import { getTodayJst, isValidDateString } from "@/lib/date";
import { FOCUS_PROGRAM_END, FOCUS_PROGRAM_START } from "@/lib/focus-program";
import { getStorage } from "@/lib/storage";
import { FocusDailyLogInputSchema } from "@/lib/validation";

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
    const from = validDate(url.searchParams.get("from")) ? url.searchParams.get("from")! : FOCUS_PROGRAM_START;
    const to = validDate(url.searchParams.get("to")) ? url.searchParams.get("to")! : FOCUS_PROGRAM_END;
    if (from > to) return NextResponse.json({ error: "日付範囲が正しくありません。", requestId: id }, { status: 400 });
    const logs = await getStorage().listFocusLogs(from, to);
    return NextResponse.json({ logs, range: { from, to } }, { headers: { "x-request-id": id, "cache-control": "no-store" } });
  } catch (error) {
    return errorResponse(error, id);
  }
}

export async function PUT(request: Request) {
  const id = requestId();
  const denied = await accessError(id);
  if (denied) return denied;
  try {
    const input = FocusDailyLogInputSchema.parse(await readJsonBody(request));
    if (input.date < FOCUS_PROGRAM_START || input.date > FOCUS_PROGRAM_END) {
      return NextResponse.json({ error: "14日間プログラムの対象日を選択してください。", requestId: id }, { status: 400 });
    }
    if (input.date > getTodayJst()) {
      return NextResponse.json({ error: "未来の日付はまだ記録できません。", requestId: id }, { status: 400 });
    }
    const log = await getStorage().upsertFocusLog(input);
    return NextResponse.json({ log }, { headers: { "x-request-id": id, "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof SyntaxError) return NextResponse.json({ error: "JSON形式が正しくありません。", requestId: id }, { status: 400 });
    if (error instanceof RequestBodyTooLargeError) return NextResponse.json({ error: "入力が大きすぎます。", requestId: id }, { status: 413 });
    if (error && typeof error === "object" && "issues" in error) {
      return NextResponse.json({ error: "集中リセットの入力内容を確認してください。", requestId: id }, { status: 400 });
    }
    return errorResponse(error, id);
  }
}
