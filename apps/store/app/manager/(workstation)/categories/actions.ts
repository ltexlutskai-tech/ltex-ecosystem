"use server";

import { prisma } from "@ltex/db";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { canManageCatalog } from "@/lib/manager/catalog-permissions";

/**
 * Категорії CRUD у CRM (7.2 Блок 3.2) — порт `/admin/categories`, гейт роллю
 * каталогу (admin/owner/warehouse). 1С-дерево (`code1C != null`) не чіпаємо —
 * видаляти можна лише куровані категорії без товарів/підкатегорій.
 */

async function assertCatalogManager(): Promise<void> {
  const user = await getCurrentUser();
  if (!user || !canManageCatalog(user.role)) {
    throw new Error("Немає прав керувати каталогом");
  }
}

function revalidateCategoryPaths(): void {
  revalidatePath("/manager/categories");
  revalidatePath("/catalog", "layout");
  revalidatePath("/", "layout");
}

export async function createManagerCategory(formData: FormData): Promise<void> {
  await assertCatalogManager();
  const name = ((formData.get("name") as string) ?? "").trim();
  const slug = ((formData.get("slug") as string) ?? "").trim();
  const parentId = (formData.get("parentId") as string) || null;
  if (!name || !slug) throw new Error("Назва та slug обовʼязкові");

  const clash = await prisma.category.findUnique({ where: { slug } });
  if (clash) throw new Error(`Категорія зі slug «${slug}» вже існує`);

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

  revalidateCategoryPaths();
}

export async function setCategoryHidden(
  id: string,
  hidden: boolean,
): Promise<void> {
  await assertCatalogManager();
  await prisma.category.update({
    where: { id },
    data: { hiddenFromCatalog: hidden },
  });
  revalidateCategoryPaths();
}

export async function deleteManagerCategory(id: string): Promise<void> {
  await assertCatalogManager();

  const [productsCount, childrenCount, category] = await Promise.all([
    prisma.product.count({ where: { categoryId: id } }),
    prisma.category.count({ where: { parentId: id } }),
    prisma.category.findUnique({ where: { id }, select: { code1C: true } }),
  ]);

  if (category?.code1C) {
    throw new Error("Категорію з 1С видаляти не можна");
  }
  if (productsCount > 0 || childrenCount > 0) {
    throw new Error("Категорія має товари або підкатегорії");
  }

  await prisma.category.delete({ where: { id } });
  revalidateCategoryPaths();
}
