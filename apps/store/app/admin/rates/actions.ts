"use server";

import { prisma } from "@ltex/db";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin-auth";

export async function addExchangeRate(formData: FormData) {
  await requireAdmin();
  const currencyFrom = formData.get("currencyFrom") as string;
  const currencyTo = formData.get("currencyTo") as string;
  const rate = parseFloat(formData.get("rate") as string);
  const date = new Date();

  await prisma.exchangeRate.upsert({
    where: {
      currencyFrom_currencyTo_date: {
        currencyFrom,
        currencyTo,
        date,
      },
    },
    update: { rate, source: "manual" },
    create: {
      currencyFrom,
      currencyTo,
      rate,
      date,
      source: "manual",
    },
  });

  revalidatePath("/admin/rates");
}
