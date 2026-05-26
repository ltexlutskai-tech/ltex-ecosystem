import { NextRequest, NextResponse } from "next/server";
import { generateAutoReminders } from "@/lib/manager/generate-reminders";

export const dynamic = "force-dynamic";

const MIN_SECRET_LENGTH = 16;

function authorize(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < MIN_SECRET_LENGTH) return false;

  const headerSecret = request.headers.get("x-cron-secret");
  if (headerSecret && headerSecret === secret) return true;

  const auth = request.headers.get("authorization");
  if (auth) {
    const [scheme, token] = auth.split(" ");
    if (scheme?.toLowerCase() === "bearer" && token === secret) return true;
  }

  const queryToken = request.nextUrl.searchParams.get("token");
  if (queryToken === secret) return true;

  return false;
}

/**
 * GET /api/cron/generate-reminders
 *
 * Авто-генеровані нагадування (блок «Нагадування», Етап 4). Два детектори:
 *  • знімає протерміновані броні лотів + створює «Перенести бронь?»;
 *  • «спрацьовує» нагадування-стеження за відео, коли видео з'явилось.
 *
 * Auth: `x-cron-secret` header (preferred), `Authorization: Bearer ...`,
 * або `?token=` query param. Налаштовується через CRON_SECRET env (≥16 chars).
 *
 * Запускати з Windows Task Scheduler (наприклад раз на 5-15 хв) через curl.
 */
export async function GET(request: NextRequest) {
  if (!authorize(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await generateAutoReminders();
    return NextResponse.json(result);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Unknown error";
    console.error("[L-TEX] generate-reminders failed", { error: message });
    return NextResponse.json(
      { bronCreated: 0, videoFired: 0, error: message },
      { status: 500 },
    );
  }
}
