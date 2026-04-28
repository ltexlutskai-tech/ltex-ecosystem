import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ltex/db";

export const dynamic = "force-dynamic";

const DEFAULT_DAYS = 90;
const MIN_DAYS = 30;
const MAX_DAYS = 365;
const MIN_SECRET_LENGTH = 16;

function authorize(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < MIN_SECRET_LENGTH) return false;

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
 * POST /api/cron/cleanup-viewlog?days=90
 *
 * Drops ViewLog entries older than `days` days. Default 90, min 30, max 365.
 * Auth: Bearer <CRON_SECRET> header or ?token=<CRON_SECRET> query param.
 */
export async function POST(request: NextRequest) {
  if (!authorize(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = request.nextUrl;
  const daysParam = searchParams.get("days");
  let days = DEFAULT_DAYS;
  if (daysParam) {
    const parsed = parseInt(daysParam, 10);
    if (!isNaN(parsed) && parsed >= MIN_DAYS && parsed <= MAX_DAYS) {
      days = parsed;
    }
  }

  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const result = await prisma.viewLog.deleteMany({
    where: { viewedAt: { lt: cutoff } },
  });

  return NextResponse.json({
    deleted: result.count,
    cutoff: cutoff.toISOString(),
    days,
  });
}
