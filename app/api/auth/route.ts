import { NextResponse } from "next/server";
import { isValidAccessToken, sessionCookieName, sessionCookieValue } from "@/lib/auth";
import { config } from "@/lib/config";
import { readJsonBody, RequestBodyTooLargeError, requestId } from "@/lib/http";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const id = requestId();
  let body: { token?: string } | null = null;
  try {
    body = (await readJsonBody(request)) as { token?: string } | null;
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) return NextResponse.json({ error: "入力が大きすぎます。", requestId: id }, { status: 413, headers: { "x-request-id": id, "cache-control": "no-store" } });
    return NextResponse.json({ error: "JSON形式が正しくありません。", requestId: id }, { status: 400, headers: { "x-request-id": id, "cache-control": "no-store" } });
  }
  if (!config.appAccessToken) return NextResponse.json({ authenticated: true, requestId: id }, { headers: { "x-request-id": id, "cache-control": "no-store" } });
  if (!body?.token || !isValidAccessToken(body.token)) {
    return NextResponse.json({ error: "アクセスコードが正しくありません。", requestId: id }, { status: 401, headers: { "x-request-id": id, "cache-control": "no-store" } });
  }

  const response = NextResponse.json({ authenticated: true, requestId: id }, { headers: { "x-request-id": id, "cache-control": "no-store" } });
  response.cookies.set({
    name: sessionCookieName(),
    value: sessionCookieValue(),
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return response;
}
