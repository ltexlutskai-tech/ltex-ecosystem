import { prisma } from "@ltex/db";

export async function getActivePromoStripe() {
  const stripe = await prisma.promoStripe.findFirst({
    where: { isActive: true },
  });
  return stripe;
}
