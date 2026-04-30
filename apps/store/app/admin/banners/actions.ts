"use server";

import { prisma } from "@ltex/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { randomBytes } from "crypto";
import { z } from "zod";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/admin-auth";
import { validateImageFile, InvalidImageError } from "@/lib/validate-image";

const bannerSchema = z.object({
  imageUrl: z.string().min(1, "Зображення обов'язкове"),
  ctaHref: z.string().min(1, "Посилання обов'язкове").max(500),
  position: z.number().int().min(0).default(0),
  isActive: z.boolean().default(true),
});

function parseBannerForm(formData: FormData) {
  const positionRaw = formData.get("position");
  return bannerSchema.parse({
    imageUrl: (formData.get("imageUrl") as string) ?? "",
    ctaHref: (formData.get("ctaHref") as string) ?? "",
    position:
      typeof positionRaw === "string" && positionRaw.length > 0
        ? parseInt(positionRaw, 10)
        : 0,
    isActive: formData.get("isActive") === "on",
  });
}

export async function createBanner(formData: FormData) {
  await requireAdmin();
  const data = parseBannerForm(formData);
  await prisma.banner.create({ data });
  revalidatePath("/admin/banners");
  revalidatePath("/");
  redirect("/admin/banners");
}

export async function updateBanner(id: string, formData: FormData) {
  await requireAdmin();
  const data = parseBannerForm(formData);
  await prisma.banner.update({ where: { id }, data });
  revalidatePath("/admin/banners");
  revalidatePath("/");
  redirect("/admin/banners");
}

export async function deleteBanner(id: string) {
  await requireAdmin();
  await prisma.banner.delete({ where: { id } });
  revalidatePath("/admin/banners");
  revalidatePath("/");
}

export async function uploadBannerImage(
  formData: FormData,
): Promise<{ url: string }> {
  await requireAdmin();
  const file = formData.get("file") as File | null;
  if (!file) {
    throw new Error("Файл не надано");
  }

  // Sniff actual bytes — file.name extension and file.type are attacker-controlled.
  let validated;
  try {
    validated = await validateImageFile(file, { maxBytes: 10 * 1024 * 1024 });
  } catch (err) {
    if (err instanceof InvalidImageError) throw new Error(err.message);
    throw err;
  }

  const supabase = createServiceRoleClient();

  const id = randomBytes(12).toString("hex");
  const fileName = `banners/${id}.${validated.type}`;

  const { error } = await supabase.storage
    .from("product-images")
    .upload(fileName, file, { contentType: validated.mime });

  if (error) {
    throw new Error(`Upload failed: ${error.message}`);
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from("product-images").getPublicUrl(fileName);

  return { url: publicUrl };
}

export async function reorderBanners(ids: string[]) {
  await requireAdmin();
  await prisma.$transaction(
    ids.map((id, index) =>
      prisma.banner.update({
        where: { id },
        data: { position: index },
      }),
    ),
  );
  revalidatePath("/admin/banners");
  revalidatePath("/");
}
