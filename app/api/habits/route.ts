import { NextResponse } from "next/server";
import { accessError, errorResponse, readJsonBody, RequestBodyTooLargeError, requestId } from "@/lib/http";
import { getStorage } from "@/lib/storage";
import { HabitInputSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const id = requestId();
  const denied = await accessError(id);
  if (denied) return denied;
  try {
    const includeInactive = new URL(request.url).searchParams.get("includeInactive") === "true";
    const habits = await getStorage().listHabits(includeInactive);
    return NextResponse.json({ habits }, { headers: { "x-request-id": id, "cache-control": "no-store" } });
  } catch (error) {
    return errorResponse(error, id);
  }
}

export async function POST(request: Request) {
  const id = requestId();
  const denied = await accessError(id);
  if (denied) return denied;
  try {
    const input = HabitInputSchema.parse(await readJsonBody(request));
    const habit = await getStorage().upsertHabit(input);
    return NextResponse.json({ habit }, { status: 201, headers: { "x-request-id": id, "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof SyntaxError) return NextResponse.json({ error: "JSON形式が正しくありません。", requestId: id }, { status: 400 });
    if (error instanceof RequestBodyTooLargeError) return NextResponse.json({ error: "入力が大きすぎます。", requestId: id }, { status: 413 });
    if (error && typeof error === "object" && "issues" in error) {
      return NextResponse.json({ error: "継続項目の入力内容を確認してください。", requestId: id }, { status: 400 });
    }
    return errorResponse(error, id);
  }
}
