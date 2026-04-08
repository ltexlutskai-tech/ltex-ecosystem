"use server";

import { prisma } from "@ltex/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient as createSupabaseAdmin } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin-auth";

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
  if (!file || file.size === 0) return;

  const supabase = await createSupabaseAdmin();

  const ext = file.name.split(".").pop();
  const fileName = `${productId}/${Date.now()}.${ext}`;

  const { error } = await supabase.storage
    .from("product-images")
    .upload(fileName, file, { contentType: file.type });

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
      const supabase = await createSupabaseAdmin();
      await supabase.storage.from("product-images").remove([urlParts[1]]);
    }

    await prisma.productImage.delete({ where: { id: imageId } });
  }

  revalidatePath(`/admin/products/${productId}`);
}
