"use server";

import { prisma } from "@ltex/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin-auth";

const schema = z.object({
  text: z.string().min(1).max(300),
  ctaLabel: z.string().max(100).optional().nullable(),
  ctaHref: z
    .string()
    .max(500)
    .refine(
      (url) => {
        if (!url) return true;
        // Allow relative paths starting with / or absolute http(s):// URLs only
        return url.startsWith("/") || /^https?:\/\//.test(url);
      },
      { message: "URL має починатись з / або http(s)://" },
    )
    .optional()
    .nullable(),
  bgColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default("#dc2626"),
  textColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default("#ffffff"),
  isActive: z.boolean().default(false),
});

export async function savePromoStripe(formData: FormData) {
  await requireAdmin();

  const data = schema.parse({
    text: formData.get("text") ?? "",
    ctaLabel: (formData.get("ctaLabel") as string) || null,
    ctaHref: (formData.get("ctaHref") as string) || null,
    bgColor: (formData.get("bgColor") as string) || "#dc2626",
    textColor: (formData.get("textColor") as string) || "#ffffff",
    isActive: formData.get("isActive") === "on",
  });

  // Single-row pattern: always operate on the first row, create if missing
  const existing = await prisma.promoStripe.findFirst();
  if (existing) {
    await prisma.promoStripe.update({
      where: { id: existing.id },
      data,
    });
  } else {
    await prisma.promoStripe.create({ data });
  }

  revalidatePath("/admin/promo");
  revalidatePath("/");
  redirect("/admin/promo");
}
