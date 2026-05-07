import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@ltex/db";
import { getCurrentCustomer } from "@/lib/customer-auth";

/**
 * POST /api/customer/favorites/sync
 *
 * Used after login to merge the local-storage wishlist (S73) into the
 * authenticated Favorite table. Server-win on conflict — DB rows are
 * the source of truth, but local-only items get persisted.
 *
 * Body: { items: { productId: string }[] }
 * Response: { items: { productId: string }[] }  // merged set, capped at 100
 */
const FAVORITE_CAP = 100;

const itemSchema = z.object({
  productId: z.string().min(1),
});

const bodySchema = z.object({
  items: z.array(itemSchema).max(500),
});

export async function POST(request: NextRequest) {
  const customer = await getCurrentCustomer();
  if (!customer) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", issues: parsed.error.issues.slice(0, 3) },
      { status: 400 },
    );
  }

  const localProductIds = Array.from(
    new Set(parsed.data.items.map((i) => i.productId)),
  );

  // Server-side current favorites for this customer.
  const existing = await prisma.favorite.findMany({
    where: { customerId: customer.id },
    select: { productId: true },
  });
  const existingIds = new Set(existing.map((f) => f.productId));

  // Persist any local items that don't already exist on the server,
  // up to the per-customer cap.
  const slotsAvailable = Math.max(0, FAVORITE_CAP - existingIds.size);
  const toCreate = localProductIds
    .filter((id) => !existingIds.has(id))
    .slice(0, slotsAvailable);

  if (toCreate.length > 0) {
    // Validate that products actually exist (silently drop unknown IDs).
    const validProducts = await prisma.product.findMany({
      where: { id: { in: toCreate } },
      select: { id: true },
    });
    const validIds = new Set(validProducts.map((p) => p.id));

    if (validIds.size > 0) {
      await prisma.favorite.createMany({
        data: Array.from(validIds).map((productId) => ({
          customerId: customer.id,
          productId,
        })),
        skipDuplicates: true,
      });
      for (const id of validIds) existingIds.add(id);
    }
  }

  return NextResponse.json({
    items: Array.from(existingIds)
      .slice(0, FAVORITE_CAP)
      .map((productId) => ({ productId })),
  });
}
