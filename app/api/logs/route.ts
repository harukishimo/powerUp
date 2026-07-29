import { NextResponse } from "next/server";
import { accessError, errorResponse, readJsonBody, RequestBodyTooLargeError, requestId } from "@/lib/http";
import { getTodayJst, isValidDateString, shiftDate } from "@/lib/date";
import { calculateScores } from "@/lib/scoring";
import { getStorage } from "@/lib/storage";
import { SaveLogRequestSchema } from "@/lib/validation";

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
    const from = validDate(url.searchParams.get("from")) ? url.searchParams.get("from")! : shiftDate(to, -6);
    if (from > to) return NextResponse.json({ error: "日付範囲が正しくありません。", requestId: id }, { status: 400, headers: { "x-request-id": id, "cache-control": "no-store" } });
    const logs = await getStorage().list(from, to);
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
    const parsed = SaveLogRequestSchema.parse(await readJsonBody(request));
    const scores = calculateScores(parsed);
    const log = await getStorage().upsert(parsed, scores, parsed.clientRequestId);
    return NextResponse.json({ saved: true, clientRequestId: parsed.clientRequestId, log }, { headers: { "x-request-id": id, "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof SyntaxError) return NextResponse.json({ error: "JSON形式が正しくありません。", requestId: id }, { status: 400 });
    if (error instanceof RequestBodyTooLargeError) return NextResponse.json({ error: "入力が大きすぎます。", requestId: id }, { status: 413, headers: { "x-request-id": id, "cache-control": "no-store" } });
    if (error && typeof error === "object" && "issues" in error) {
      return NextResponse.json({ error: "入力内容を確認してください。", requestId: id }, { status: 400 });
    }
    return errorResponse(error, id);
  }
}
