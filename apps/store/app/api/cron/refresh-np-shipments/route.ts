import { NextRequest, NextResponse } from "next/server";
import { refreshNpShipments } from "@/lib/delivery/refresh-shipments";

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
 * GET /api/cron/refresh-np-shipments
 *
 * Фонове оновлення статусів відправлень Нової Пошти (для трекінгу в кабінеті та
 * сповіщень клієнту про отримання). Auth: `x-cron-secret` header / Bearer /
 * `?token=` (CRON_SECRET ≥16 символів). Запускати з Windows Task Scheduler
 * (наприклад раз на 30–60 хв) через curl.
 */
export async function GET(request: NextRequest) {
  if (!authorize(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await refreshNpShipments();
    return NextResponse.json(result);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Unknown error";
    console.error("[L-TEX] refresh-np-shipments failed", { error: message });
    return NextResponse.json(
      { checked: 0, updated: 0, delivered: 0, error: message },
      { status: 500 },
    );
  }
}
