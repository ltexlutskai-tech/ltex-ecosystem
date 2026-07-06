"use server";

import { prisma } from "@ltex/db";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { canManageCatalog } from "@/lib/manager/catalog-permissions";

/**
 * Зміна категорії товару з CRM-картки (7.2). Гейт — роль каталогу
 * (admin/owner/warehouse). Переніс у видиму категорію знову показує товар на
 * сайті/агентам; у приховану — ховає.
 */
export async function changeProductCategory(
  productId: string,
  categoryId: string,
): Promise<void> {
  const user = await getCurrentUser();
  if (!user || !canManageCatalog(user.role)) {
    throw new Error("Немає прав керувати каталогом");
  }
  if (!categoryId) throw new Error("Оберіть категорію");

  const product = await prisma.product.update({
    where: { id: productId },
    data: { categoryId },
    select: { slug: true },
  });

  revalidatePath(`/manager/prices/${productId}`);
  revalidatePath("/catalog", "layout");
  if (product.slug) revalidatePath(`/product/${product.slug}`);
}
