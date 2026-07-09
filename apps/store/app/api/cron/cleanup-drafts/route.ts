import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ltex/db";
import { deleteAbandonedDrafts } from "@/lib/autosave/cleanup-drafts";

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
 * GET /api/cron/cleanup-drafts
 *
 * Прибирає порожні покинуті чернетки документів (autosave), старші за N днів
 * (за замовч. 14; `?days=` перевизначає). Повертає лічильники видалених по типах.
 *
 * Auth: `x-cron-secret` header (preferred), `Authorization: Bearer ...`, або
 * `?token=` query param. Налаштовується через CRON_SECRET env (≥16 chars).
 *
 * Запускати з Windows Task Scheduler раз на добу через curl.
 */
export async function GET(request: NextRequest) {
  if (!authorize(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const daysRaw = request.nextUrl.searchParams.get("days");
  const daysParsed = daysRaw ? Number.parseInt(daysRaw, 10) : NaN;
  const olderThanDays =
    Number.isFinite(daysParsed) && daysParsed > 0 ? daysParsed : 14;

  try {
    const counts = await deleteAbandonedDrafts(prisma, olderThanDays);
    return NextResponse.json({ ok: true, olderThanDays, counts });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Unknown error";
    console.error("[L-TEX] cleanup-drafts failed", { error: message });
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
