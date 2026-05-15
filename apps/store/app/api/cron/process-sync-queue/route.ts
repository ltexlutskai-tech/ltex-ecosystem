import { NextRequest, NextResponse } from "next/server";
import { processSyncQueue } from "@/lib/sync/queue-processor";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MIN_SECRET_LENGTH = 16;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

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
 * GET /api/cron/process-sync-queue?limit=20
 *
 * Дренує pending/retrying MgrSyncJob whose nextAttemptAt <= now.
 * Auth: `x-cron-secret` header (preferred), `Authorization: Bearer ...`,
 * або `?token=` query param. Configure via CRON_SECRET env (≥16 chars).
 *
 * Викликається через Windows Task Scheduler кожну ~1 хв (див.
 * docs/M1.5_SYNC_ARCHITECTURE.md розділ Task Scheduler).
 */
export async function GET(request: NextRequest) {
  if (!authorize(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limitParam = request.nextUrl.searchParams.get("limit");
  let limit = DEFAULT_LIMIT;
  if (limitParam) {
    const parsed = parseInt(limitParam, 10);
    if (!Number.isNaN(parsed) && parsed > 0 && parsed <= MAX_LIMIT) {
      limit = parsed;
    }
  }

  const result = await processSyncQueue(limit);
  return NextResponse.json(result);
}

// POST дублює GET — деякі cron-runner-и шлять POST за default-ом.
export async function POST(request: NextRequest) {
  return GET(request);
}
