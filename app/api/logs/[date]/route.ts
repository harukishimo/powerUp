import { NextResponse } from "next/server";
import { accessError, errorResponse, requestId } from "@/lib/http";
import { isValidDateString } from "@/lib/date";
import { getStorage } from "@/lib/storage";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ date: string }> }) {
  const id = requestId();
  const denied = await accessError(id);
  if (denied) return denied;
  try {
    const { date } = await context.params;
    if (!isValidDateString(date)) {
      return NextResponse.json({ error: "日付形式が正しくありません。", requestId: id }, { status: 400, headers: { "x-request-id": id, "cache-control": "no-store" } });
    }
    const log = await getStorage().get(date);
    if (!log) return NextResponse.json({ error: "指定日のログが見つかりません。", requestId: id }, { status: 404, headers: { "x-request-id": id, "cache-control": "no-store" } });
    return NextResponse.json({ log }, { headers: { "x-request-id": id, "cache-control": "no-store" } });
  } catch (error) {
    return errorResponse(error, id);
  }
}
