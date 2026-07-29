import type { z } from "zod";
import { ErrorResponseSchema } from "@/lib/validation";

export class ClientApiError extends Error {
  constructor(message: string, readonly status: number, readonly retryable = false) {
    super(message);
    this.name = "ClientApiError";
  }
}

export async function parseApiResponse<TSchema extends z.ZodType>(response: Response, schema: TSchema): Promise<z.infer<TSchema>> {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new ClientApiError("サーバーからの応答を確認できませんでした。", response.status);
  }
  if (!response.ok) {
    const error = ErrorResponseSchema.safeParse(body);
    throw new ClientApiError(error.success ? error.data.error : "処理に失敗しました。", response.status, error.success ? Boolean(error.data.retryable) : false);
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new ClientApiError("サーバーからの応答を確認できませんでした。", response.status);
  return parsed.data;
}
