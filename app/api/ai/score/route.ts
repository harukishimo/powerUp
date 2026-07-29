import { NextResponse } from "next/server";
import { accessError, errorResponse, readJsonBody, RequestBodyTooLargeError, requestId } from "@/lib/http";
import { requestAiScore } from "@/lib/gemini";
import { AiScoreRequestSchema } from "@/lib/validation";
import { consumeRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const id = requestId();
  const denied = await accessError(id);
  if (denied) return denied;
  const clientKey = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const rate = consumeRateLimit(`ai:${clientKey}`);
  if (!rate.allowed) {
    return NextResponse.json({ error: "AIの利用上限に達した可能性があります。通常の採点は利用できます。", retryable: true, requestId: id }, { status: 429, headers: { "x-request-id": id, "retry-after": String(rate.retryAfter), "cache-control": "no-store" } });
  }
  try {
    const parsed = AiScoreRequestSchema.parse(await readJsonBody(request));
    try {
      const result = await requestAiScore(parsed);
      return NextResponse.json(result, { headers: { "x-request-id": id } });
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (/429|rate|quota|resource exhausted/i.test(message)) {
        return NextResponse.json(
          { error: "AIの利用上限に達した可能性があります。通常の採点は利用できます。", retryable: true, requestId: id },
          { status: 429, headers: { "x-request-id": id, "retry-after": "60", "cache-control": "no-store" } },
        );
      }
      return NextResponse.json({ error: "Geminiの応答を確認できませんでした。通常の採点は利用できます。", retryable: true, requestId: id }, { status: 502, headers: { "x-request-id": id, "cache-control": "no-store" } });
    }
  } catch (error) {
    if (error instanceof SyntaxError) return NextResponse.json({ error: "JSON形式が正しくありません。", requestId: id }, { status: 400 });
    if (error instanceof RequestBodyTooLargeError) return NextResponse.json({ error: "入力が大きすぎます。", requestId: id }, { status: 413, headers: { "x-request-id": id, "cache-control": "no-store" } });
    if (error && typeof error === "object" && "issues" in error) {
      return NextResponse.json({ error: "AI入力の形式を確認してください。", requestId: id }, { status: 400 });
    }
    return errorResponse(error, id);
  }
}
