import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { hasAccess } from "@/lib/auth";

const MAX_BODY_BYTES = 64 * 1024;

export function requestId() {
  return randomUUID();
}

export class RequestBodyTooLargeError extends Error {}

export async function readJsonBody(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_BODY_BYTES) throw new RequestBodyTooLargeError();
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) throw new RequestBodyTooLargeError();
  return JSON.parse(text) as unknown;
}

export async function accessError(id = requestId()) {
  if (await hasAccess()) return null;
  return NextResponse.json({ error: "アクセス権限がありません。", code: "UNAUTHORIZED", requestId: id }, { status: 401, headers: { "x-request-id": id, "cache-control": "no-store" } });
}

export function errorResponse(error: unknown, id: string) {
  const message = error instanceof Error ? error.message : "Unknown error";
  console.error(`[powerUp:${id}] request failed`, error instanceof Error ? error.name : "UnknownError");
  const isConfig = message.includes("environment variables") || message.includes("not configured");
  return NextResponse.json(
    {
      error: isConfig ? "サーバー設定が未完了です。環境変数を確認してください。" : "処理に失敗しました。時間をおいて再試行してください。",
      requestId: id,
      retryable: !isConfig,
    },
    { status: isConfig ? 503 : 500, headers: { "x-request-id": id, "cache-control": "no-store" } },
  );
}
