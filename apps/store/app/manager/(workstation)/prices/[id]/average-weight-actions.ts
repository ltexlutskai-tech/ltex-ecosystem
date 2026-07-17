"use server";

import { prisma } from "@ltex/db";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { canManageCatalogStructure } from "@/lib/manager/catalog-permissions";

/**
 * Зміна «Середньої ваги» товару з картки — характеристика, яку система
 * підставляє у замовлення/реалізацію замість дефолтних 20 кг на мішок.
 *
 * Значення в кг (0 < w ≤ 100) або `null` (очистити → знову дефолт 20 кг).
 * Гейт — роль каталогу (admin/owner/warehouse).
 */
export async function updateProductAverageWeight(
  productId: string,
  averageWeight: number | null,
): Promise<void> {
  const user = await getCurrentUser();
  if (!user || !canManageCatalogStructure(user.role)) {
    throw new Error("Немає прав керувати каталогом");
  }

  let value: number | null = null;
  if (averageWeight != null) {
    if (!Number.isFinite(averageWeight) || averageWeight <= 0) {
      throw new Error("Вага має бути більшою за 0");
    }
    if (averageWeight > 100) {
      throw new Error("Вага мішка не може перевищувати 100 кг");
    }
    // Округлюємо до грамів.
    value = Math.round(averageWeight * 1000) / 1000;
  }

  await prisma.product.update({
    where: { id: productId },
    data: { averageWeight: value },
  });

  revalidatePath(`/manager/prices/${productId}`);
}
