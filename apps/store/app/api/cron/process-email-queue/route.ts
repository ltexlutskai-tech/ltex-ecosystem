import { NextRequest, NextResponse } from "next/server";
import { processEmailQueue } from "@/lib/email";

export const dynamic = "force-dynamic";

const MIN_SECRET_LENGTH = 16;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

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
 * GET /api/cron/process-email-queue?limit=50
 *
 * Drains pending/retrying EmailJob rows whose nextAttemptAt <= now.
 * Auth: `x-cron-secret` header (preferred), `Authorization: Bearer ...`,
 * or `?token=` query param. Configure via CRON_SECRET env (≥16 chars).
 *
 * Run from Windows Task Scheduler every 1-5 minutes via curl. See
 * docs/EMAIL_QUEUE.md for setup instructions.
 */
export async function GET(request: NextRequest) {
  if (!authorize(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limitParam = request.nextUrl.searchParams.get("limit");
  let limit = DEFAULT_LIMIT;
  if (limitParam) {
    const parsed = parseInt(limitParam, 10);
    if (!isNaN(parsed) && parsed > 0 && parsed <= MAX_LIMIT) {
      limit = parsed;
    }
  }

  const result = await processEmailQueue(limit);
  return NextResponse.json(result);
}
