import { NextResponse } from "next/server";
import { accessError, errorResponse, readJsonBody, RequestBodyTooLargeError, requestId } from "@/lib/http";
import { getStorage } from "@/lib/storage";
import { HabitInputSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const requestIdentifier = requestId();
  const denied = await accessError(requestIdentifier);
  if (denied) return denied;
  try {
    const { id } = await context.params;
    if (!id || id.length > 120) {
      return NextResponse.json({ error: "継続項目IDが正しくありません。", requestId: requestIdentifier }, { status: 400 });
    }
    const storage = getStorage();
    const existing = (await storage.listHabits(true)).find((habit) => habit.id === id);
    if (!existing) {
      return NextResponse.json({ error: "継続項目が見つかりません。", requestId: requestIdentifier }, { status: 404 });
    }
    const input = HabitInputSchema.parse(await readJsonBody(request));
    const habit = await storage.upsertHabit(input, id);
    return NextResponse.json({ habit }, { headers: { "x-request-id": requestIdentifier, "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof SyntaxError) return NextResponse.json({ error: "JSON形式が正しくありません。", requestId: requestIdentifier }, { status: 400 });
    if (error instanceof RequestBodyTooLargeError) return NextResponse.json({ error: "入力が大きすぎます。", requestId: requestIdentifier }, { status: 413 });
    if (error && typeof error === "object" && "issues" in error) {
      return NextResponse.json({ error: "継続項目の入力内容を確認してください。", requestId: requestIdentifier }, { status: 400 });
    }
    return errorResponse(error, requestIdentifier);
  }
}
