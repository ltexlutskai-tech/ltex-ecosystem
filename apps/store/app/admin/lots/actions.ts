"use server";

import { requireAdmin } from "@/lib/admin-auth";
import { prisma } from "@ltex/db";
import { LOT_STATUSES, type LotStatus } from "@ltex/shared";
import { revalidatePath } from "next/cache";

export async function updateLotStatus(lotId: string, status: LotStatus) {
  await requireAdmin();
  if (!LOT_STATUSES.includes(status)) {
    throw new Error(`Invalid status: ${status}`);
  }

  const lot = await prisma.lot.update({
    where: { id: lotId },
    data: { status },
    select: {
      barcode: true,
      product: { select: { slug: true } },
    },
  });

  revalidatePath("/admin/lots");
  revalidatePath("/admin");
  revalidatePath("/lots");
  revalidatePath(`/lot/${encodeURIComponent(lot.barcode)}`);
  if (lot.product) revalidatePath(`/product/${lot.product.slug}`);
  revalidatePath("/catalog");
}

export async function bulkUpdateLotStatus(lotIds: string[], status: LotStatus) {
  await requireAdmin();
  if (!LOT_STATUSES.includes(status)) {
    throw new Error(`Invalid status: ${status}`);
  }
  if (lotIds.length === 0) return;

  const lots = await prisma.lot.findMany({
    where: { id: { in: lotIds } },
    select: {
      barcode: true,
      product: { select: { slug: true } },
    },
  });

  await prisma.lot.updateMany({
    where: { id: { in: lotIds } },
    data: { status },
  });

  revalidatePath("/admin/lots");
  revalidatePath("/admin");
  revalidatePath("/lots");
  revalidatePath("/catalog");
  // Per-lot/product revalidation only when batch is small — looping over
  // hundreds of paths would be expensive and starve the cache.
  if (lots.length <= 10) {
    const seenSlugs = new Set<string>();
    for (const lot of lots) {
      revalidatePath(`/lot/${encodeURIComponent(lot.barcode)}`);
      if (lot.product && !seenSlugs.has(lot.product.slug)) {
        seenSlugs.add(lot.product.slug);
        revalidatePath(`/product/${lot.product.slug}`);
      }
    }
  }
}
