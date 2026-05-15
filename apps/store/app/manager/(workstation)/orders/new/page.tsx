import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { getCurrentRate } from "@/lib/exchange-rate";
import { OrderForm } from "./_components/order-form";
import type { ClientPickerItem } from "./_components/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "Нове замовлення — L-TEX Manager" };

export default async function NewOrderPage({
  searchParams,
}: {
  searchParams: Promise<{ clientId?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/manager/login");

  const sp = await searchParams;
  const requestedClientId = sp.clientId ?? null;

  // Pre-fetch initial client summary якщо clientId передано через query.
  let initialClient: ClientPickerItem | null = null;
  if (requestedClientId) {
    const customer = await prisma.customer.findUnique({
      where: { id: requestedClientId },
      select: { id: true, code1C: true, name: true, city: true },
    });
    if (customer) {
      initialClient = {
        id: customer.id,
        code1C: customer.code1C,
        name: customer.name,
        tradePointName: null,
        city: customer.city,
        debt: "0",
        agent: null,
        isOwned: true,
      };
    }
  }

  const exchangeRate = await getCurrentRate();

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link
        href="/manager/orders"
        className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900"
      >
        <ArrowLeft className="h-4 w-4" />
        Назад до списку
      </Link>

      <header>
        <h1 className="text-2xl font-bold text-gray-800">Нове замовлення</h1>
        <p className="mt-1 text-sm text-gray-500">
          Виберіть клієнта, додайте позиції та збережіть. Після створення
          замовлення відправиться у 1С через чергу синхронізації.
        </p>
      </header>

      <OrderForm
        initialClientId={initialClient?.id ?? null}
        initialClient={initialClient}
        exchangeRate={exchangeRate}
      />
    </div>
  );
}
