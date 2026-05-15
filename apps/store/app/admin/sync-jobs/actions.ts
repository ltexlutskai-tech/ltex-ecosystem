"use server";

import { prisma } from "@ltex/db";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin-auth";

/**
 * Reset failed MgrSyncJob → pending щоб cron worker підхопив immediately.
 * Resets attempts=0, clears lastError, sets nextAttemptAt=now.
 *
 * Тільки `failed` jobs можна retry — для cancelled/sent/retrying — no-op.
 */
export async function retrySyncJob(id: string): Promise<void> {
  await requireAdmin();

  const job = await prisma.mgrSyncJob.findUnique({
    where: { id },
    select: { status: true },
  });
  if (!job) throw new Error("Sync job not found");
  if (job.status !== "failed") {
    throw new Error("Only failed jobs can be retried");
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

  revalidatePath("/admin/sync-jobs");
}
