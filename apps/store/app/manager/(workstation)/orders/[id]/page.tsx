import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { getCurrentRate } from "@/lib/exchange-rate";
import { canViewOrder } from "@/lib/manager/order-ownership";
import { getOwnedClientIds } from "@/lib/manager/client-visibility";
import { canEditOrder, isOrderLocked } from "@/lib/manager/order-status";
import { formatOrderNumber } from "@/lib/manager/order-number";
import {
  getDeliveryMethodOptions,
  getDeliveryLabelResolver,
} from "@/lib/manager/delivery-methods";
import { OrderForm } from "../new/_components/order-form";
import { OrderCloseButton } from "./_components/order-close-button";
import { OrderActualToggle } from "./_components/order-actual-toggle";
import type {
  ClientPickerItem,
  OrderEditInitial,
  OrderItemDraft,
} from "../new/_components/types";
import { OrderStatusBadge } from "../../customers/[id]/_components/order-status-badge";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const order = await prisma.order.findUnique({
    where: { id },
    select: { code1C: true, number1C: true },
  });
  return {
    title: order
      ? `Замовлення №${formatOrderNumber(order)} — L-TEX Manager`
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

  // «Продано» — агрегат по SaleItem для реалізацій, прив'язаних до цього замовлення.
  const soldRows = await prisma.saleItem.groupBy({
    by: ["productId"],
    where: { sale: { orderId: order.id } },
    _sum: { quantity: true },
  });
  const soldMap: Record<string, number> = Object.fromEntries(
    soldRows.map((g) => [g.productId, g._sum.quantity ?? 0]),
  );

  // Закрите замовлення (Етап 3 блоку Замовлення) — підвантажуємо причину.
  const orderClose = order.closedAt
    ? await prisma.order.findUnique({
        where: { id: order.id },
        select: {
          closedAt: true,
          closeNotes: true,
          closeReason: { select: { label: true } },
          closedBy: { select: { fullName: true } },
        },
      })
    : null;

  const editable = canEditOrder(order.status) && !order.closedAt;
  const locked = isOrderLocked(order.status) || !!order.closedAt;

  // Допоміжні дані для форми (тільки коли редагуємо).
  // Резолв MgrClient (для деталей + лінка на картку): за code1C, а для сайтових
  // клієнтів без code1C — за основним телефоном (7.2 фікс навігації).
  const mgrWhere = order.customer.code1C
    ? { code1C: order.customer.code1C }
    : order.customer.phone
      ? { phonePrimary: order.customer.phone }
      : null;
  const [exchangeRate, mgr, ownedIds] = await Promise.all([
    getCurrentRate(),
    mgrWhere
      ? prisma.mgrClient.findFirst({
          where: mgrWhere,
          select: {
            id: true,
            debt: true,
            phonePrimary: true,
            street: true,
            house: true,
          },
        })
      : Promise.resolve(null),
    getOwnedClientIds(user),
  ]);
  // Лінк/клік на картку клієнта — лише для СВОГО клієнта (7.3, рішення user);
  // чужі клієнти з форми замовлення не відкриваються.
  const mgrClientId =
    mgr && (ownedIds === null || ownedIds.has(mgr.id)) ? mgr.id : null;

  const mgrAddress = mgr
    ? [mgr.street, mgr.house].filter(Boolean).join(", ") || null
    : null;

  // Способи доставки — з редагованого довідника (7.3).
  const [deliveryMethods, deliveryLabelOf] = await Promise.all([
    getDeliveryMethodOptions(),
    getDeliveryLabelResolver(),
  ]);

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

  const orderNumber = formatOrderNumber(order);

  const initialOrder: OrderEditInitial = {
    id: order.id,
    displayNumber: order.number1C ?? order.code1C ?? "авто",
    status: order.status,
    isActual: order.isActual,
    notes: order.notes ?? "",
    priceTypeId: order.priceTypeId,
    deliveryMethod: order.deliveryMethod,
    cashOnDelivery: order.cashOnDelivery,
    assignedAgentUserId: order.assignedAgentUserId,
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
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-800">
            {order.code1C || order.number1C
              ? `Замовлення №${orderNumber}`
              : "Замовлення"}
            {order.source === "site" && (
              <span
                className="inline-flex items-center rounded bg-blue-100 px-2 py-0.5 text-xs font-semibold tracking-wide text-blue-700"
                title="Замовлення з сайту"
              >
                Сайт
              </span>
            )}
          </h1>
          <p className="mt-1 text-sm text-gray-500">Створено: {date}</p>
        </div>
        <div className="flex items-center gap-2">
          {!editable && <OrderStatusBadge status={order.status} />}
          {locked && !order.closedAt && !order.archived && (
            <OrderActualToggle orderId={order.id} isActual={order.isActual} />
          )}
          <Link
            href={`/manager/orders/${id}/print`}
            target="_blank"
            className="rounded-md border border-gray-300 bg-white px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            📄 Рахунок
          </Link>
          <OrderCloseButton
            orderId={order.id}
            status={order.status}
            isAlreadyClosed={!!order.closedAt}
          />
        </div>
      </header>

      {/* Інфо про закриття (Етап 3 блоку Замовлення) */}
      {orderClose && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm">
          <div className="font-medium text-red-900">❌ Замовлення закрите</div>
          <div className="mt-1 text-xs text-red-800">
            Причина: <strong>{orderClose.closeReason?.label ?? "—"}</strong>
            {orderClose.closedBy?.fullName &&
              ` · Закрив: ${orderClose.closedBy.fullName}`}
            {orderClose.closedAt &&
              ` · ${new Date(orderClose.closedAt).toLocaleString("uk-UA")}`}
          </div>
          {orderClose.closeNotes && (
            <div className="mt-1 text-xs text-red-700">
              Коментар: {orderClose.closeNotes}
            </div>
          )}
        </div>
      )}

      {editable ? (
        <OrderForm
          mode="edit"
          orderId={order.id}
          initialOrder={initialOrder}
          initialClientId={order.customer.id}
          initialClient={clientSummary}
          mgrClientId={mgrClientId}
          exchangeRate={exchangeRate}
          deliveryMethods={deliveryMethods}
          currentUserId={user.id}
          currentUserName={user.fullName}
        />
      ) : (
        <ReadOnlyOrder
          order={order}
          deliveryLabel={deliveryLabelOf(order.deliveryMethod)}
          locked={locked}
          soldMap={soldMap}
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
          product: { select: { id: true, name: true, priceUnit: true } },
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
  soldMap,
}: {
  order: OrderForView;
  deliveryLabel: string;
  locked: boolean;
  soldMap: Record<string, number>;
}) {
  return (
    <div className="space-y-6">
      <section className="rounded-lg border bg-white p-5">
        <p className="text-sm text-gray-500">
          {locked
            ? "Замовлення проведено в 1С — редагування заборонено."
            : "Замовлення скасовано — лише перегляд."}
        </p>
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
                  <th className="px-3 py-2 text-right font-medium">Продано</th>
                  <th className="px-3 py-2 text-right font-medium">Ціна, €</th>
                </tr>
              </thead>
              <tbody>
                {order.items.map((it) => {
                  const sold = soldMap[it.product.id] ?? 0;
                  const fulfilled = sold >= it.quantity;
                  return (
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
                      <td
                        className={`px-3 py-2 text-right ${fulfilled ? "font-medium text-green-700" : "text-gray-700"}`}
                      >
                        {sold}
                      </td>
                      <td className="px-3 py-2 text-right text-gray-700">
                        {it.priceEur.toFixed(2)}
                      </td>
                    </tr>
                  );
                })}
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
