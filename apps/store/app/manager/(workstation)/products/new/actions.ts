"use server";

import { prisma } from "@ltex/db";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { generateSlug } from "@ltex/shared";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { canManageCatalog } from "@/lib/manager/catalog-permissions";
import { parseNumericRange } from "@/lib/manager/parse-numeric-range";

export interface CreateProductState {
  error?: string;
}

async function uniqueSlug(base: string): Promise<string> {
  const root = base || "tovar";
  let slug = root;
  let n = 2;
  while (
    await prisma.product.findUnique({ where: { slug }, select: { id: true } })
  ) {
    slug = `${root}-${n}`;
    n += 1;
    if (n > 100) {
      slug = `${root}-${base.length}-${n}`;
      break;
    }
  }
  return slug;
}

/**
 * Наступний код товару у форматі 1С (`_Code`): найбільший числовий `code_1c`
 * серед товарів + 1, доповнений нулями до 11 знаків (як у 1С). Продовжує
 * нумерацію після останнього коду, що прийшов з 1С.
 */
async function nextProductCode1C(): Promise<string> {
  const rows = await prisma.$queryRaw<{ max: bigint | null }[]>`
    SELECT MAX(CAST(code_1c AS BIGINT)) AS max
    FROM products
    WHERE code_1c ~ '^[0-9]+$'
  `;
  const max = rows[0]?.max ? Number(rows[0].max) : 0;
  return String(max + 1).padStart(11, "0");
}

/**
 * Підказка коду товару для форми (наступний вільний 1С-код). Форма підставляє
 * його у поле «Код товару», але користувач може перезаписати вручну.
 */
export async function suggestNextProductCode1C(): Promise<string> {
  return nextProductCode1C();
}

/**
 * Створення товару з CRM (7.2 Блок 3.3). Гейт — роль каталогу. Обовʼязкові
 * поля (рішення user): назва, артикул, категорія, одиниця, ціна, опис, стать,
 * розміри. Quality + country потрібні схемою Product (теж у формі). Створює
 * товар + продажну ціну (wholesale €), редіректить у картку (де є фото).
 */
export async function createManagerProduct(
  _prev: CreateProductState | null,
  formData: FormData,
): Promise<CreateProductState> {
  const user = await getCurrentUser();
  if (!user || !canManageCatalog(user.role)) {
    return { error: "Немає прав керувати каталогом" };
  }

  const name = ((formData.get("name") as string) ?? "").trim();
  const articleCode = ((formData.get("articleCode") as string) ?? "").trim();
  const categoryId = (formData.get("categoryId") as string) ?? "";
  const quality = (formData.get("quality") as string) ?? "";
  const country = (formData.get("country") as string) ?? "";
  const priceUnit = (formData.get("priceUnit") as string) || "kg";
  const description = ((formData.get("description") as string) ?? "").trim();
  const gender = ((formData.get("gender") as string) || "").trim() || null;
  const sizes = ((formData.get("sizes") as string) || "").trim() || null;
  const producer = ((formData.get("producer") as string) || "").trim() || null;
  const receiptName =
    ((formData.get("receiptName") as string) || "").trim() || null;
  const videoUrl = ((formData.get("videoUrl") as string) || "").trim() || null;
  const season = ((formData.get("season") as string) || "").trim();
  const filling = ((formData.get("filling") as string) || "").trim() || null;
  const unitsPerKgRaw =
    ((formData.get("unitsPerKg") as string) || "").trim() || null;
  const unitWeightRaw =
    ((formData.get("unitWeight") as string) || "").trim() || null;
  const averageWeightRaw = (
    (formData.get("averageWeight") as string) || ""
  ).trim();
  const code1CInput = ((formData.get("code1C") as string) || "").trim();
  const price = Number.parseFloat((formData.get("price") as string) ?? "");

  if (!name) return { error: "Назва обовʼязкова" };
  if (!articleCode) return { error: "Артикул обовʼязковий" };
  if (!categoryId) return { error: "Оберіть категорію" };
  if (!quality) return { error: "Оберіть якість" };
  if (!country) return { error: "Оберіть країну" };
  if (!description) return { error: "Опис обовʼязковий" };
  if (!gender) return { error: "Вкажіть стать" };
  if (!sizes) return { error: "Вкажіть розміри" };
  if (!Number.isFinite(price) || price <= 0) {
    return { error: "Вкажіть коректну ціну (€)" };
  }

  const averageWeight =
    averageWeightRaw && Number.isFinite(Number.parseFloat(averageWeightRaw))
      ? Number.parseFloat(averageWeightRaw)
      : null;
  const unitsRange = parseNumericRange(unitsPerKgRaw);
  const weightRange = parseNumericRange(unitWeightRaw);

  // Код 1С: користувач може вписати свій; інакше — наступний вільний.
  const code1C = code1CInput || (await nextProductCode1C());
  if (code1CInput) {
    const clash = await prisma.product.findUnique({
      where: { code1C: code1CInput },
      select: { id: true },
    });
    if (clash) return { error: `Код товару «${code1CInput}» вже зайнятий` };
  }

  const slug = await uniqueSlug(generateSlug(name));

  let productId: string;
  try {
    const product = await prisma.product.create({
      data: {
        name,
        slug,
        code1C,
        articleCode,
        categoryId,
        quality,
        country,
        season,
        priceUnit,
        description,
        gender,
        sizes,
        filling,
        producer,
        receiptName,
        videoUrl,
        averageWeight,
        unitsPerKg: unitsPerKgRaw,
        unitsPerKgMin: unitsRange?.min ?? null,
        unitsPerKgMax: unitsRange?.max ?? null,
        unitWeight: unitWeightRaw,
        unitWeightMin: weightRange?.min ?? null,
        unitWeightMax: weightRange?.max ?? null,
        inStock: true,
      },
      select: { id: true },
    });
    productId = product.id;
    await prisma.price.create({
      data: {
        productId,
        priceType: "wholesale",
        currency: "EUR",
        amount: price,
      },
    });
  } catch {
    return { error: "Не вдалося створити товар (перевірте категорію/артикул)" };
  }

  revalidatePath("/manager/prices");
  revalidatePath("/catalog", "layout");
  redirect(`/manager/prices/${productId}`);
}
