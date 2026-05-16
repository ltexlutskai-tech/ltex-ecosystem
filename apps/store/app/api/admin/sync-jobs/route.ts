import { NextRequest, NextResponse } from "next/server";
import { Prisma, prisma } from "@ltex/db";
import { requireAdmin } from "@/lib/admin-auth";

/**
 * GET /api/admin/sync-jobs?status=pending,failed&page=1&pageSize=50
 *
 * Admin-only endpoint для browsing/filtering sync queue. Mirror-ить
 * UI /admin/sync-jobs page.
 */
export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const statusRaw = url.searchParams.get("status")?.trim() ?? "";
  const page = Math.max(
    1,
    Number.parseInt(url.searchParams.get("page") ?? "1", 10) || 1,
  );
  const pageSize = Math.min(
    200,
    Math.max(
      10,
      Number.parseInt(url.searchParams.get("pageSize") ?? "50", 10) || 50,
    ),
  );

  const allowed = new Set(["pending", "retrying", "sent", "failed"]);
  const statuses = statusRaw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => allowed.has(s));

  const where: Prisma.MgrSyncJobWhereInput =
    statuses.length > 0
      ? {
          status: {
            in: statuses as Array<"pending" | "retrying" | "sent" | "failed">,
          },
        }
      : {};

  const [items, total] = await Promise.all([
    prisma.mgrSyncJob.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.mgrSyncJob.count({ where }),
  ]);

  return NextResponse.json({
    items: items.map((j) => ({
      id: j.id,
      entityType: j.entityType,
      entityId: j.entityId,
      action: j.action,
      status: j.status,
      attempts: j.attempts,
      maxAttempts: j.maxAttempts,
      nextAttemptAt: j.nextAttemptAt.toISOString(),
      lastError: j.lastError,
      sentAt: j.sentAt?.toISOString() ?? null,
      createdAt: j.createdAt.toISOString(),
      updatedAt: j.updatedAt.toISOString(),
    })),
    total,
    page,
    pageSize,
  });
}
