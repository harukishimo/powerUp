import { createHash, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { config } from "@/lib/config";

const SESSION_COOKIE = "powerup_session";

function digest(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function hasAppGate() {
  return Boolean(config.appAccessToken);
}

export async function hasAccess() {
  if (!hasAppGate()) return true;
  const cookieStore = await cookies();
  const value = cookieStore.get(SESSION_COOKIE)?.value;
  return Boolean(value && safeEqual(value, digest(config.appAccessToken)));
}

export function isValidAccessToken(value: string) {
  return Boolean(config.appAccessToken && safeEqual(value, config.appAccessToken));
}

export function sessionCookieName() {
  return SESSION_COOKIE;
}

export function sessionCookieValue() {
  return digest(config.appAccessToken);
}
