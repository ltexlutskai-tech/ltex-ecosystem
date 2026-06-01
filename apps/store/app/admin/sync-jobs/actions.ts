"use server";

import { prisma } from "@ltex/db";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin-auth";

/**
 * Reset failed/retrying MgrSyncJob → pending щоб cron worker підхопив immediately.
 * Resets attempts=0, clears lastError, sets nextAttemptAt=now.
 *
 * Дозволено для `failed` і `retrying` — для cancelled/sent — no-op.
 * (retrying потрібен бо backoff schedule може бути довгим — 30m/2h/6h, admin
 * хоче примусово прискорити після того як виправив корінь помилки в 1С.)
 */
export async function retrySyncJob(id: string): Promise<void> {
  await requireAdmin();

  const job = await prisma.mgrSyncJob.findUnique({
    where: { id },
    select: { status: true },
  });
  if (!job) throw new Error("Sync job not found");
  if (job.status !== "failed" && job.status !== "retrying") {
    throw new Error("Only failed or retrying jobs can be retried");
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
