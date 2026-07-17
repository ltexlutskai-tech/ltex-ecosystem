"use server";

import { prisma } from "@ltex/db";
import { revalidatePath } from "next/cache";
import sharp from "sharp";
import { saveMediaFile, deleteMediaByUrl } from "@/lib/media/storage";
import { validateImageFile, InvalidImageError } from "@/lib/validate-image";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { canManageCatalogStructure } from "@/lib/manager/catalog-permissions";

/**
 * Керування фото товару з CRM-картки (7.2 Блок 3). Дзеркало
 * `app/admin/products/actions.ts` (той самий sharp-пайплайн + self-hosted
 * `/media`), але гейт — менеджерська роль (admin/owner/warehouse), не Supabase.
 */

async function assertCatalogManager(): Promise<void> {
  const user = await getCurrentUser();
  if (!user || !canManageCatalogStructure(user.role)) {
    throw new Error("Немає прав керувати каталогом");
  }
}

async function revalidateAfterImageChange(productId: string): Promise<void> {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { slug: true },
  });
  revalidatePath(`/manager/prices/${productId}`);
  if (product) {
    revalidatePath(`/product/${product.slug}`);
    revalidatePath("/catalog");
  }
}

export async function uploadManagerProductImage(
  productId: string,
  formData: FormData,
): Promise<void> {
  await assertCatalogManager();
  const file = formData.get("file") as File | null;
  if (!file) return;

  try {
    await validateImageFile(file, { maxBytes: 5 * 1024 * 1024 });
  } catch (err) {
    if (err instanceof InvalidImageError) throw new Error(err.message);
    throw err;
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const optimized = await sharp(buf)
    .rotate()
    .resize({
      width: 1920,
      height: 1920,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: 82 })
    .toBuffer();

  const publicUrl = await saveMediaFile(
    `product-images/${productId}/${Date.now()}.webp`,
    optimized,
  );

  const imageCount = await prisma.productImage.count({ where: { productId } });
  await prisma.productImage.create({
    data: { productId, url: publicUrl, alt: "", position: imageCount },
  });

  await revalidateAfterImageChange(productId);
}

export async function deleteManagerProductImage(
  imageId: string,
  productId: string,
): Promise<void> {
  await assertCatalogManager();
  const image = await prisma.productImage.findUnique({
    where: { id: imageId },
  });
  if (image) {
    await deleteMediaByUrl(image.url);
    await prisma.productImage.delete({ where: { id: imageId } });
  }
  await revalidateAfterImageChange(productId);
}

export async function reorderManagerProductImages(
  productId: string,
  imageIds: string[],
): Promise<void> {
  await assertCatalogManager();
  await prisma.$transaction(
    imageIds.map((id, index) =>
      prisma.productImage.update({
        where: { id },
        data: { position: index },
      }),
    ),
  );
  await revalidateAfterImageChange(productId);
}
