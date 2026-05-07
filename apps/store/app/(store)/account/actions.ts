"use server";

import { z } from "zod";
import { prisma } from "@ltex/db";
import { revalidatePath } from "next/cache";
import { getCurrentCustomer } from "@/lib/customer-auth";

const profileSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().email().or(z.literal("")).optional().nullable(),
  telegram: z.string().trim().max(50).optional().nullable(),
  city: z.string().trim().max(100).optional().nullable(),
  notes: z.string().trim().max(500).optional().nullable(),
});

export interface UpdateProfileResult {
  ok: boolean;
  error?: string;
}

function nullable(value: FormDataEntryValue | null): string | null {
  if (value === null) return null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

export async function updateProfileAction(
  _prevState: UpdateProfileResult | undefined,
  formData: FormData,
): Promise<UpdateProfileResult> {
  const customer = await getCurrentCustomer();
  if (!customer) {
    return { ok: false, error: "Not authenticated" };
  }

  const parsed = profileSchema.safeParse({
    name: formData.get("name"),
    email: nullable(formData.get("email")),
    telegram: nullable(formData.get("telegram")),
    city: nullable(formData.get("city")),
    notes: nullable(formData.get("notes")),
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Невірні дані",
    };
  }

  const data = parsed.data;
  await prisma.customer.update({
    where: { id: customer.id },
    data: {
      name: data.name,
      email: data.email && data.email.length > 0 ? data.email : null,
      telegram: data.telegram ?? null,
      city: data.city ?? null,
      notes: data.notes ?? null,
    },
  });

  revalidatePath("/account");
  return { ok: true };
}
