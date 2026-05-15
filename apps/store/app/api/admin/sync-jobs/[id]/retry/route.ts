import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ltex/db";
import { requireAdmin } from "@/lib/admin-auth";

/**
 * POST /api/admin/sync-jobs/[id]/retry — admin-only endpoint to reset
 * a failed MgrSyncJob to pending so cron worker picks it up immediately.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const job = await prisma.mgrSyncJob.findUnique({
    where: { id },
    select: { status: true },
  });
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }
  if (job.status !== "failed") {
    return NextResponse.json(
      { error: "Only failed jobs can be retried" },
      { status: 400 },
    );
  }

  await prisma.mgrSyncJob.update({
    where: { id },
    data: {
      status: "pending",
      attempts: 0,
      nextAttemptAt: new Date(),
      lastError: null,
    },
  });

  return NextResponse.json({ ok: true });
}
