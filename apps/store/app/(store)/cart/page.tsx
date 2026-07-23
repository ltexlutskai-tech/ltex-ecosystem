import { prisma } from "@ltex/db";
import { getCurrentRate } from "@/lib/exchange-rate";
import { getCurrentCustomer } from "@/lib/customer-auth";
import { UA_REGIONS } from "@/lib/constants/regions";
import { CartClient } from "./cart-client";

/** Мапить збережену область (label або slug) у slug для селекта кошика. */
function regionToSlug(value: string | null | undefined): string {
  if (!value) return "";
  const hit = UA_REGIONS.find((r) => r.slug === value || r.label === value);
  return hit?.slug ?? "";
}

export default async function CartPage() {
  const [rate, customer] = await Promise.all([
    getCurrentRate(),
    getCurrentCustomer(),
  ]);
  // Профіль покупця (область/telegram) — щоб НЕ перепитувати те, що вже знаємо.
  const profile = customer
    ? await prisma.customer.findUnique({
        where: { id: customer.id },
        select: { region: true, city: true, telegram: true },
      })
    : null;
  return (
    <CartClient
      rate={rate}
      initialName={customer?.name ?? ""}
      initialPhone={customer?.phone ?? ""}
      initialRegion={regionToSlug(profile?.region ?? profile?.city)}
      initialTelegram={profile?.telegram ?? ""}
    />
  );
}
