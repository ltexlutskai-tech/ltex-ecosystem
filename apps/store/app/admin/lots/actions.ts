"use server";

import { prisma } from "@ltex/db";
import { LOT_STATUSES, type LotStatus } from "@ltex/shared";
import { revalidatePath } from "next/cache";

export async function updateLotStatus(lotId: string, status: LotStatus) {
  if (!LOT_STATUSES.includes(status)) {
    throw new Error(`Invalid status: ${status}`);
  }

  await prisma.lot.update({
    where: { id: lotId },
    data: { status },
  });

  revalidatePath("/admin/lots");
  revalidatePath("/admin");
}

export async function bulkUpdateLotStatus(lotIds: string[], status: LotStatus) {
  if (!LOT_STATUSES.includes(status)) {
    throw new Error(`Invalid status: ${status}`);
  }
  if (lotIds.length === 0) return;

  await prisma.lot.updateMany({
    where: { id: { in: lotIds } },
    data: { status },
  });

  revalidatePath("/admin/lots");
  revalidatePath("/admin");
}
