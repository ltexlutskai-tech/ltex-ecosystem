"use server";

import { prisma } from "@ltex/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { randomBytes } from "crypto";
import { z } from "zod";
import { createClient as createSupabaseAdmin } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin-auth";

const bannerSchema = z.object({
  title: z.string().min(1, "Заголовок обов'язковий").max(200),
  subtitle: z.string().max(500).optional().nullable(),
  imageUrl: z.string().min(1, "Зображення обов'язкове"),
  ctaLabel: z.string().max(100).optional().nullable(),
  ctaHref: z.string().max(500).optional().nullable(),
  position: z.number().int().min(0).default(0),
  isActive: z.boolean().default(true),
});

function parseBannerForm(formData: FormData) {
  const positionRaw = formData.get("position");
  return bannerSchema.parse({
    title: formData.get("title") ?? "",
    subtitle: (formData.get("subtitle") as string) || null,
    imageUrl: (formData.get("imageUrl") as string) ?? "",
    ctaLabel: (formData.get("ctaLabel") as string) || null,
    ctaHref: (formData.get("ctaHref") as string) || null,
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
  if (!file || file.size === 0) {
    throw new Error("Файл не надано");
  }

  const supabase = await createSupabaseAdmin();

  const ext = (file.name.split(".").pop() ?? "jpg").toLowerCase();
  const id = randomBytes(12).toString("hex");
  const fileName = `banners/${id}.${ext}`;

  const { error } = await supabase.storage
    .from("product-images")
    .upload(fileName, file, { contentType: file.type });

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
