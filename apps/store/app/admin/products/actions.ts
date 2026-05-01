"use server";

import { prisma } from "@ltex/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import sharp from "sharp";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/admin-auth";
import { validateImageFile, InvalidImageError } from "@/lib/validate-image";

export async function createProduct(formData: FormData) {
  await requireAdmin();
  const data = {
    name: formData.get("name") as string,
    slug: formData.get("slug") as string,
    categoryId: formData.get("categoryId") as string,
    description: (formData.get("description") as string) ?? "",
    quality: formData.get("quality") as string,
    season: (formData.get("season") as string) ?? "",
    country: formData.get("country") as string,
    priceUnit: (formData.get("priceUnit") as string) ?? "kg",
    averageWeight: formData.get("averageWeight")
      ? parseFloat(formData.get("averageWeight") as string)
      : null,
    videoUrl: (formData.get("videoUrl") as string) || null,
    articleCode: (formData.get("articleCode") as string) || null,
    code1C: (formData.get("code1C") as string) || null,
    inStock: formData.get("inStock") === "on",
  };

  await prisma.product.create({ data });
  revalidatePath("/admin/products");
  redirect("/admin/products");
}

export async function updateProduct(id: string, formData: FormData) {
  await requireAdmin();
  const data = {
    name: formData.get("name") as string,
    slug: formData.get("slug") as string,
    categoryId: formData.get("categoryId") as string,
    description: (formData.get("description") as string) ?? "",
    quality: formData.get("quality") as string,
    season: (formData.get("season") as string) ?? "",
    country: formData.get("country") as string,
    priceUnit: (formData.get("priceUnit") as string) ?? "kg",
    averageWeight: formData.get("averageWeight")
      ? parseFloat(formData.get("averageWeight") as string)
      : null,
    videoUrl: (formData.get("videoUrl") as string) || null,
    articleCode: (formData.get("articleCode") as string) || null,
    code1C: (formData.get("code1C") as string) || null,
    inStock: formData.get("inStock") === "on",
  };

  await prisma.product.update({ where: { id }, data });
  revalidatePath("/admin/products");
  redirect("/admin/products");
}

export async function deleteProduct(id: string) {
  await requireAdmin();
  await prisma.product.delete({ where: { id } });
  revalidatePath("/admin/products");
}

export async function uploadProductImage(
  productId: string,
  formData: FormData,
) {
  await requireAdmin();
  const file = formData.get("file") as File;
  if (!file) return;

  // Sniff actual bytes — file.name extension and file.type are attacker-controlled.
  try {
    await validateImageFile(file, { maxBytes: 5 * 1024 * 1024 });
  } catch (err) {
    if (err instanceof InvalidImageError) throw new Error(err.message);
    throw err;
  }

  // Resize + convert to WEBP server-side. Originals can be 5 MB JPEGs from
  // phones; product gallery loads them as-is, killing mobile bandwidth.
  // 1920px on the long side is plenty for next/image's 2x retina scaling on
  // any reasonable viewport. EXIF orientation is honored via .rotate().
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

  const supabase = createServiceRoleClient();

  const fileName = `${productId}/${Date.now()}.webp`;

  const { error } = await supabase.storage
    .from("product-images")
    .upload(fileName, optimized, { contentType: "image/webp" });

  if (error) throw new Error(`Upload failed: ${error.message}`);

  const {
    data: { publicUrl },
  } = supabase.storage.from("product-images").getPublicUrl(fileName);

  const imageCount = await prisma.productImage.count({
    where: { productId },
  });

  await prisma.productImage.create({
    data: {
      productId,
      url: publicUrl,
      alt: "",
      position: imageCount,
    },
  });

  revalidatePath(`/admin/products/${productId}`);
}

export async function deleteProductImage(imageId: string, productId: string) {
  await requireAdmin();
  const image = await prisma.productImage.findUnique({
    where: { id: imageId },
  });

  if (image) {
    // Extract path from URL to delete from storage
    const urlParts = image.url.split("/product-images/");
    if (urlParts[1]) {
      const supabase = createServiceRoleClient();
      await supabase.storage.from("product-images").remove([urlParts[1]]);
    }

    await prisma.productImage.delete({ where: { id: imageId } });
  }

  revalidatePath(`/admin/products/${productId}`);
}

export async function reorderProductImages(
  productId: string,
  imageIds: string[],
) {
  await requireAdmin();

  await prisma.$transaction(
    imageIds.map((id, index) =>
      prisma.productImage.update({
        where: { id },
        data: { position: index },
      }),
    ),
  );

  revalidatePath(`/admin/products/${productId}`);
}
