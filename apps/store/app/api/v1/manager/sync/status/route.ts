import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/v1/manager/sync/status
 *
 * Real-time стан outbound sync черги для header-індикатора.
 * Counts pending+retrying jobs, returns timestamp last successful send.
 *
 * Polled з UI кожні 30s — тому force-dynamic + cache busting.
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }

  const [pendingCount, retryingCount, failedCount, lastSent] =
    await Promise.all([
      prisma.mgrSyncJob.count({ where: { status: "pending" } }),
      prisma.mgrSyncJob.count({ where: { status: "retrying" } }),
      prisma.mgrSyncJob.count({ where: { status: "failed" } }),
      prisma.mgrSyncJob.findFirst({
        where: { status: "sent", sentAt: { not: null } },
        orderBy: { sentAt: "desc" },
        select: { sentAt: true },
      }),
    ]);

  return NextResponse.json({
    pendingCount,
    retryingCount,
    failedCount,
    queuedCount: pendingCount + retryingCount,
    lastSentAt: lastSent?.sentAt?.toISOString() ?? null,
  });
}
