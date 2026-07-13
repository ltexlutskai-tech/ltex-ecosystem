import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { getCurrentRate } from "@/lib/exchange-rate";
import { OrderForm } from "./_components/order-form";
import type { ClientPickerItem, OrderItemDraft } from "./_components/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "Нове замовлення — L-TEX Manager" };

/**
 * Перенос позицій із блоку «Закриття замовлень» (7.3): `?carry=<orderId:productId,…>`.
 * Вантажимо ці рядки з БД, будуємо item-драфти й підтягуємо клієнта з замовлення.
 */
async function loadCarry(carry: string): Promise<{
  items: OrderItemDraft[];
  customerId: string | null;
}> {
  const pairs = carry
    .split(",")
    .map((s) => s.split(":"))
    .filter((p): p is [string, string] => p.length === 2 && !!p[0] && !!p[1]);
  if (pairs.length === 0) return { items: [], customerId: null };
  const orderIds = [...new Set(pairs.map((p) => p[0]))];
  const wanted = new Set(pairs.map((p) => `${p[0]}:${p[1]}`));

  const orders = await prisma.order.findMany({
    where: { id: { in: orderIds } },
    select: {
      id: true,
      customerId: true,
      items: {
        include: {
          product: {
            select: {
              id: true,
              code1C: true,
              articleCode: true,
              name: true,
              slug: true,
              priceUnit: true,
              averageWeight: true,
              inStock: true,
              prices: {
                where: { priceType: { in: ["wholesale", "akciya"] } },
                select: { priceType: true, amount: true, currency: true },
              },
            },
          },
        },
      },
    },
  });

  const items: OrderItemDraft[] = [];
  let customerId: string | null = null;
  for (const order of orders) {
    customerId = order.customerId;
    for (const it of order.items) {
      if (!wanted.has(`${order.id}:${it.productId}`)) continue;
      items.push({
        uid: `carry-${it.id}`,
        product: {
          id: it.product.id,
          code1C: it.product.code1C,
          articleCode: it.product.articleCode,
          name: it.product.name,
          slug: it.product.slug,
          priceUnit: it.product.priceUnit,
          averageWeight: it.product.averageWeight,
          inStock: it.product.inStock,
          prices: it.product.prices.map((pr) => ({
            priceType: pr.priceType,
            amount: pr.amount,
            currency: pr.currency,
          })),
        },
        lot: null,
        bindToLot: false,
        weight: Number(it.weight),
        quantity: it.quantity,
        priceEur: Number(it.priceEur),
        unitPriceEur:
          Number(it.weight) > 0
            ? Math.round((Number(it.priceEur) / Number(it.weight)) * 100) / 100
            : 0,
      });
    }
  }
  return { items, customerId };
}

export default async function NewOrderPage({
  searchParams,
}: {
  searchParams: Promise<{ clientId?: string; carry?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/manager/login");

  const sp = await searchParams;

  // Перенос позицій із «Закриття замовлень» — має пріоритет над clientId.
  let carryItems: OrderItemDraft[] = [];
  let requestedClientId = sp.clientId ?? null;
  if (sp.carry) {
    const carried = await loadCarry(sp.carry);
    carryItems = carried.items;
    if (carried.customerId) requestedClientId = carried.customerId;
  }

  // Pre-fetch initial client summary якщо clientId передано через query.
  let initialClient: ClientPickerItem | null = null;
  if (requestedClientId) {
    const customer = await prisma.customer.findUnique({
      where: { id: requestedClientId },
      select: { id: true, code1C: true, name: true, city: true, phone: true },
    });
    if (customer) {
      // Підтягуємо тип цін / борг / контакти з дзеркала MgrClient.
      const mgr = customer.code1C
        ? await prisma.mgrClient.findUnique({
            where: { code1C: customer.code1C },
            select: {
              debt: true,
              priceTypeId: true,
              phonePrimary: true,
              street: true,
              house: true,
            },
          })
        : null;
      const address = mgr
        ? [mgr.street, mgr.house].filter(Boolean).join(", ") || null
        : null;
      initialClient = {
        id: customer.id,
        code1C: customer.code1C,
        name: customer.name,
        tradePointName: null,
        city: customer.city,
        phone: customer.phone ?? mgr?.phonePrimary ?? null,
        address,
        debt: mgr?.debt?.toString() ?? "0",
        priceTypeId: mgr?.priceTypeId ?? null,
        agent: null,
        isOwned: true,
      };
    }
  }

  // Допоміжні дані для форми.
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
          Виберіть клієнта, додайте позиції та збережіть. «Зберегти» — чернетка
          (можна редагувати), «Зберегти та провести» — фіксує документ.
        </p>
      </header>

      <OrderForm
        initialClientId={initialClient?.id ?? null}
        initialClient={initialClient}
        initialItems={carryItems}
        exchangeRate={exchangeRate}
        currentUserId={user.id}
        currentUserName={user.fullName}
        currentUserRole={user.role}
      />
    </div>
  );
}
