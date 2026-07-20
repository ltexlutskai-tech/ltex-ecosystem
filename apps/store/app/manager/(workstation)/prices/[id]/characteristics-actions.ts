"use server";

import { prisma } from "@ltex/db";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { canEditProductCard } from "@/lib/manager/catalog-permissions";
import { parseNumericRange } from "@/lib/manager/parse-numeric-range";

export interface CharacteristicsState {
  ok?: boolean;
  error?: string;
}

/**
 * Редагування «Характеристик» товару з картки (2026-07-17). Дозволяє
 * доповнити старі позиції полями з форми створення: Сорт/Стать/Сезон/Країна
 * (значення довідників), Розміри/Кількість одиниць/Вага одиниці (текст),
 * Наповнення, Виробник, YouTube. Гейт — роль каталогу (admin/owner/warehouse).
 * «Вага лота» (середня вага) редагується окремим блоком (лише власник/адмін).
 *
 * Числові діапазони units_per_kg_* / unit_weight_* перераховуються з тексту,
 * щоб товар одразу коректно потрапляв у слайдери фільтрів сайту.
 */
export async function updateProductCharacteristics(
  _prev: CharacteristicsState | null,
  formData: FormData,
): Promise<CharacteristicsState> {
  const user = await getCurrentUser();
  if (!user || !canEditProductCard(user.role)) {
    return { error: "Немає прав редагувати картку товару" };
  }

  const productId = ((formData.get("productId") as string) ?? "").trim();
  if (!productId) return { error: "Не вказано товар" };

  const str = (key: string): string =>
    ((formData.get(key) as string) ?? "").trim();

  const quality = str("quality");
  const country = str("country");
  const season = str("season");
  const gender = str("gender") || null;
  const sizes = str("sizes") || null;
  const filling = str("filling") || null;
  const producer = str("producer") || null;
  const receiptName = str("receiptName") || null;
  const videoUrl = str("videoUrl") || null;
  const unitsPerKg = str("unitsPerKg") || null;
  const unitWeight = str("unitWeight") || null;

  if (!quality) return { error: "Оберіть якість (сорт)" };
  if (!country) return { error: "Оберіть країну" };

  const unitsRange = parseNumericRange(unitsPerKg);
  const weightRange = parseNumericRange(unitWeight);

  const product = await prisma.product.update({
    where: { id: productId },
    data: {
      quality,
      country,
      season,
      gender,
      sizes,
      filling,
      producer,
      receiptName,
      videoUrl,
      unitsPerKg,
      unitsPerKgMin: unitsRange?.min ?? null,
      unitsPerKgMax: unitsRange?.max ?? null,
      unitWeight,
      unitWeightMin: weightRange?.min ?? null,
      unitWeightMax: weightRange?.max ?? null,
    },
    select: { slug: true },
  });

  revalidatePath(`/manager/prices/${productId}`);
  revalidatePath("/catalog", "layout");
  if (product.slug) revalidatePath(`/product/${product.slug}`);
  return { ok: true };
}
