import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { getCurrentRate } from "@/lib/exchange-rate";
import { canViewOrder } from "@/lib/manager/order-ownership";
import { canEditOrder, isOrderLocked } from "@/lib/manager/order-status";
import {
  ORDER_DELIVERY_METHODS,
  orderDeliveryLabel,
} from "@/lib/manager/order-delivery";
import { OrderForm } from "../new/_components/order-form";
import type {
  AgentOption,
  ClientPickerItem,
  OrderEditInitial,
  OrderItemDraft,
  PriceTypeOption,
} from "../new/_components/types";
import { OrderStatusBadge } from "../../customers/[id]/_components/order-status-badge";
import { OrderStatusActions } from "./_components/order-status-actions";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const order = await prisma.order.findUnique({
    where: { id },
    select: { code1C: true },
  });
  return {
    title: order?.code1C
      ? `Замовлення №${order.code1C} — L-TEX Manager`
      : "Замовлення — L-TEX Manager",
  };
}

export default async function ManagerOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/manager/login");

  const { id } = await params;
  const ok = await canViewOrder(user, id);
  if (!ok) notFound();

  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      customer: {
        select: { id: true, name: true, code1C: true, phone: true, city: true },
      },
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
                select: { priceType: true, amount: true, currency: true },
              },
            },
          },
          lot: {
            select: {
              id: true,
              barcode: true,
              weight: true,
              quantity: true,
              priceEur: true,
              status: true,
            },
          },
        },
      },
    },
  });
  if (!order) notFound();

  const editable = canEditOrder(order.status);
  const locked = isOrderLocked(order.status);

  // Допоміжні дані для форми (тільки коли редагуємо).
  const [priceTypeRows, agentRows, exchangeRate, mgr] = await Promise.all([
    prisma.mgrPriceType.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.user.findMany({
      where: { isActive: true },
      orderBy: { fullName: "asc" },
      select: { id: true, fullName: true },
    }),
    getCurrentRate(),
    order.customer.code1C
      ? prisma.mgrClient.findUnique({
          where: { code1C: order.customer.code1C },
          select: {
            debt: true,
            phonePrimary: true,
            street: true,
            house: true,
          },
        })
      : Promise.resolve(null),
  ]);

  const mgrAddress = mgr
    ? [mgr.street, mgr.house].filter(Boolean).join(", ") || null
    : null;

  const priceTypes: PriceTypeOption[] = priceTypeRows.map((p) => ({
    id: p.id,
    code: p.code,
    label: p.label,
  }));
  const agents: AgentOption[] = agentRows.map((u) => ({
    id: u.id,
    fullName: u.fullName,
  }));
  const deliveryMethods = ORDER_DELIVERY_METHODS.map((d) => ({
    code: d.code,
    label: d.label,
  }));

  const clientSummary: ClientPickerItem = {
    id: order.customer.id,
    code1C: order.customer.code1C,
    name: order.customer.name,
    tradePointName: null,
    city: order.customer.city,
    phone: order.customer.phone ?? mgr?.phonePrimary ?? null,
    address: mgrAddress,
    debt: mgr?.debt?.toString() ?? "0",
    priceTypeId: order.priceTypeId,
    deliveryMethodCode: order.deliveryMethod,
    agent: null,
    isOwned: true,
  };

  // У замовлення пишемо лише загальні позиції (lotId=null), тож існуючі рядки
  // показуємо як загальні; ціна за кг = priceEur / weight (для редагування).
  const itemDrafts: OrderItemDraft[] = order.items.map((it) => ({
    uid: it.id,
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
    weight: it.weight,
    quantity: it.quantity,
    priceEur: it.priceEur,
    unitPriceEur:
      it.weight > 0 ? Math.round((it.priceEur / it.weight) * 100) / 100 : 0,
  }));

  const initialOrder: OrderEditInitial = {
    id: order.id,
    displayNumber: order.code1C ?? order.id.slice(0, 8),
    status: order.status,
    notes: order.notes ?? "",
    priceTypeId: order.priceTypeId,
    deliveryMethod: order.deliveryMethod,
    cashOnDelivery: order.cashOnDelivery,
    assignedAgentUserId: order.assignedAgentUserId,
    exportTo1C: order.exportTo1C,
    items: itemDrafts,
  };

  const date = new Date(order.createdAt).toLocaleString("uk-UA");

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link
        href="/manager/orders"
        className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900"
      >
        <ArrowLeft className="h-4 w-4" />
        Назад до списку
      </Link>

      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">
            Замовлення №{order.code1C ?? order.id.slice(0, 8)}
          </h1>
          <p className="mt-1 text-sm text-gray-500">Створено: {date}</p>
        </div>
        {!editable && <OrderStatusBadge status={order.status} />}
      </header>

      {editable ? (
        <OrderForm
          mode="edit"
          orderId={order.id}
          initialOrder={initialOrder}
          initialClientId={order.customer.id}
          initialClient={clientSummary}
          exchangeRate={exchangeRate}
          priceTypes={priceTypes}
          agents={agents}
          deliveryMethods={deliveryMethods}
          currentUserId={user.id}
          currentUserName={user.fullName}
        />
      ) : (
        <ReadOnlyOrder
          order={order}
          deliveryLabel={orderDeliveryLabel(order.deliveryMethod)}
          locked={locked}
        />
      )}
    </div>
  );
}

type OrderForView = NonNullable<Awaited<ReturnType<typeof loadOrderForView>>>;

/** Тип-хелпер для read-only рендера (без окремого запиту). */
async function loadOrderForView(id: string) {
  return prisma.order.findUnique({
    where: { id },
    include: {
      customer: {
        select: { id: true, name: true, code1C: true, phone: true, city: true },
      },
      items: {
        include: {
          product: { select: { id: true, name: true } },
          lot: { select: { id: true, barcode: true } },
        },
      },
    },
  });
}

function ReadOnlyOrder({
  order,
  deliveryLabel,
  locked,
}: {
  order: OrderForView;
  deliveryLabel: string;
  locked: boolean;
}) {
  const itemsSnapshot = order.items.map((i) => ({
    productId: i.productId,
    lotId: i.lotId,
    weight: i.weight,
    quantity: i.quantity,
    priceEur: i.priceEur,
  }));

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-white p-5">
        <div>
          <p className="text-sm text-gray-500">
            {locked
              ? "Замовлення проведено в 1С — редагування заборонено."
              : "Замовлення скасовано — лише перегляд."}
          </p>
        </div>
        <OrderStatusActions
          orderId={order.id}
          status={order.status}
          itemsSnapshot={itemsSnapshot}
        />
      </section>

      <section className="rounded-lg border bg-white p-5">
        <h2 className="text-base font-semibold text-gray-800">Клієнт</h2>
        <dl className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
          <Field label="Назва">
            <Link
              href={`/manager/customers/${order.customer.id}`}
              className="text-blue-600 hover:text-blue-700"
            >
              {order.customer.name}
            </Link>
          </Field>
          <Field label="Код 1С">
            <span className="font-mono">{order.customer.code1C ?? "—"}</span>
          </Field>
          <Field label="Телефон">{order.customer.phone ?? "—"}</Field>
          <Field label="Місто">{order.customer.city ?? "—"}</Field>
          <Field label="Доставка">{deliveryLabel}</Field>
          <Field label="Наложка">{order.cashOnDelivery ? "Так" : "Ні"}</Field>
        </dl>
      </section>

      <section className="rounded-lg border bg-white p-5">
        <h2 className="text-base font-semibold text-gray-800">
          Позиції ({order.items.length})
        </h2>
        {order.items.length === 0 ? (
          <p className="mt-3 text-sm text-gray-500">
            У замовленні немає позицій.
          </p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="px-3 py-2 font-medium">Товар</th>
                  <th className="px-3 py-2 font-medium">Лот</th>
                  <th className="px-3 py-2 text-right font-medium">Вага, кг</th>
                  <th className="px-3 py-2 text-right font-medium">К-сть</th>
                  <th className="px-3 py-2 text-right font-medium">Ціна, €</th>
                </tr>
              </thead>
              <tbody>
                {order.items.map((it) => (
                  <tr key={it.id} className="border-b last:border-b-0">
                    <td className="px-3 py-2 text-gray-800">
                      {it.product.name}
                    </td>
                    <td className="px-3 py-2 font-mono text-gray-600">
                      {it.lot?.barcode ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-right text-gray-700">
                      {it.weight.toFixed(2)}
                    </td>
                    <td className="px-3 py-2 text-right text-gray-700">
                      {it.quantity}
                    </td>
                    <td className="px-3 py-2 text-right text-gray-700">
                      {it.priceEur.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center justify-end gap-4 border-t pt-3 text-sm">
          <span className="text-gray-500">
            Сума:{" "}
            <span className="font-semibold text-gray-800">
              {order.totalEur.toFixed(2)} €
            </span>{" "}
            ·{" "}
            <span className="font-semibold text-gray-800">
              {Math.round(order.totalUah).toLocaleString("uk-UA")} ₴
            </span>
          </span>
        </div>
      </section>

      {order.notes && (
        <section className="rounded-lg border bg-white p-5">
          <h2 className="text-base font-semibold text-gray-800">Примітки</h2>
          <p className="mt-2 whitespace-pre-line text-sm text-gray-700">
            {order.notes}
          </p>
        </section>
      )}
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-gray-400">{label}</dt>
      <dd className="mt-0.5 text-gray-800">{children}</dd>
    </div>
  );
}
