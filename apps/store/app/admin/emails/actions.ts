"use server";

import { prisma } from "@ltex/db";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin-auth";

/**
 * Reset a failed/retrying EmailJob back to pending so the next cron run
 * picks it up immediately. Resets attempts to 0 and clears lastError.
 */
export async function retryEmailJob(id: string): Promise<void> {
  await requireAdmin();

  await prisma.emailJob.update({
    where: { id },
    data: {
      status: "pending",
      attempts: 0,
      nextAttemptAt: new Date(),
      lastError: null,
    },
  });

  revalidatePath("/admin/emails");
  revalidatePath("/admin");
}
