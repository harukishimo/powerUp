import { NextResponse } from "next/server";
import { isGeminiConfigured, isSheetsConfigured } from "@/lib/config";
import { requestId } from "@/lib/http";

export const runtime = "nodejs";

export async function GET() {
  const id = requestId();
  return NextResponse.json({
    status: "ok",
    service: "powerUp",
    configured: {
      sheets: isSheetsConfigured(),
      gemini: isGeminiConfigured(),
    },
    timestamp: new Date().toISOString(),
    requestId: id,
  }, { headers: { "x-request-id": id, "cache-control": "no-store" } });
}
