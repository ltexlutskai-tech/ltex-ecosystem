"use server";

import { prisma } from "@ltex/db";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin-auth";

const MAX_SEARCH_RESULTS = 20;

export async function addFeatured(productId: string, note?: string) {
  await requireAdmin();

  const max = await prisma.featuredProduct.aggregate({
    _max: { position: true },
  });
  const nextPosition = (max._max.position ?? -1) + 1;

  await prisma.featuredProduct.create({
    data: {
      productId,
      position: nextPosition,
      note: note?.trim() ? note.trim() : null,
    },
  });

  revalidatePath("/admin/featured");
  revalidatePath("/");
  revalidatePath("/top");
}

export async function removeFeatured(id: string) {
  await requireAdmin();
  await prisma.featuredProduct.delete({ where: { id } });
  revalidatePath("/admin/featured");
  revalidatePath("/");
  revalidatePath("/top");
}

export async function updateFeaturedNote(id: string, note: string) {
  await requireAdmin();
  await prisma.featuredProduct.update({
    where: { id },
    data: { note: note.trim() ? note.trim() : null },
  });
  revalidatePath("/admin/featured");
  revalidatePath("/");
  revalidatePath("/top");
}

export async function reorderFeatured(ids: string[]) {
  await requireAdmin();
  await prisma.$transaction(
    ids.map((id, index) =>
      prisma.featuredProduct.update({
        where: { id },
        data: { position: index },
      }),
    ),
  );
  revalidatePath("/admin/featured");
  revalidatePath("/");
  revalidatePath("/top");
}

export async function moveFeaturedUp(id: string) {
  await requireAdmin();

  const all = await prisma.featuredProduct.findMany({
    orderBy: { position: "asc" },
    select: { id: true },
  });
  const index = all.findIndex((e) => e.id === id);
  if (index <= 0) return;

  const ids = all.map((e) => e.id);
  const prevId = ids[index - 1];
  if (!prevId) return;
  ids[index - 1] = id;
  ids[index] = prevId;

  await prisma.$transaction(
    ids.map((entryId, i) =>
      prisma.featuredProduct.update({
        where: { id: entryId },
        data: { position: i },
      }),
    ),
  );

  revalidatePath("/admin/featured");
  revalidatePath("/");
  revalidatePath("/top");
}

export async function moveFeaturedDown(id: string) {
  await requireAdmin();

  const all = await prisma.featuredProduct.findMany({
    orderBy: { position: "asc" },
    select: { id: true },
  });
  const index = all.findIndex((e) => e.id === id);
  if (index < 0 || index >= all.length - 1) return;

  const ids = all.map((e) => e.id);
  const nextId = ids[index + 1];
  if (!nextId) return;
  ids[index + 1] = id;
  ids[index] = nextId;

  await prisma.$transaction(
    ids.map((entryId, i) =>
      prisma.featuredProduct.update({
        where: { id: entryId },
        data: { position: i },
      }),
    ),
  );

  revalidatePath("/admin/featured");
  revalidatePath("/");
  revalidatePath("/top");
}

export interface FeaturedSearchResult {
  id: string;
  name: string;
  articleCode: string | null;
  image: string | null;
}

export async function searchProductsForFeatured(
  query: string,
): Promise<FeaturedSearchResult[]> {
  await requireAdmin();

  const trimmed = query.trim();
  if (!trimmed) return [];

  const existing = await prisma.featuredProduct.findMany({
    select: { productId: true },
  });
  const excludeIds = existing.map((e) => e.productId);

  const products = await prisma.product.findMany({
    where: {
      inStock: true,
      id: excludeIds.length > 0 ? { notIn: excludeIds } : undefined,
      OR: [
        { name: { contains: trimmed, mode: "insensitive" } },
        { articleCode: { contains: trimmed, mode: "insensitive" } },
      ],
    },
    take: MAX_SEARCH_RESULTS,
    orderBy: { name: "asc" },
    include: {
      images: { take: 1, orderBy: { position: "asc" } },
    },
  });

  return products.map((p) => ({
    id: p.id,
    name: p.name,
    articleCode: p.articleCode,
    image: p.images[0]?.url ?? null,
  }));
}
