"use server";

import { prisma } from "@ltex/db";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin-auth";

export async function createCategory(formData: FormData) {
  await requireAdmin();
  const name = formData.get("name") as string;
  const slug = formData.get("slug") as string;
  const parentId = (formData.get("parentId") as string) || null;

  const maxPosition = await prisma.category.aggregate({
    where: { parentId },
    _max: { position: true },
  });

  await prisma.category.create({
    data: {
      name,
      slug,
      parentId,
      position: (maxPosition._max.position ?? 0) + 1,
    },
  });

  revalidatePath("/admin/categories");
}

export async function deleteCategory(id: string) {
  await requireAdmin();
  const productsCount = await prisma.product.count({
    where: { categoryId: id },
  });
  const childrenCount = await prisma.category.count({
    where: { parentId: id },
  });

  if (productsCount > 0 || childrenCount > 0) {
    throw new Error("Cannot delete category with products or subcategories");
  }

  await prisma.category.delete({ where: { id } });
  revalidatePath("/admin/categories");
}
