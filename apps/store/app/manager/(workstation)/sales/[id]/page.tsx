import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { getCurrentRate } from "@/lib/exchange-rate";
import { canViewSale } from "@/lib/manager/sale-ownership";
import { canEditSale, isSaleLocked } from "@/lib/manager/sale-status";
import {
  getDeliveryMethodOptions,
  getDeliveryLabelResolver,
} from "@/lib/manager/delivery-methods";
import { getActivePaymentRequisites } from "@/lib/manager/payment-requisites";
import { formatDocNumber, formatOrderNumber } from "@/lib/manager/order-number";
import { DiscussButton } from "../../messenger/_components/discuss-button";
import { SaleForm } from "../new/_components/sale-form";
import type {
  ClientPickerItem,
  SaleEditInitial,
  SaleItemDraft,
} from "../new/_components/sale-types";
import { OrderStatusBadge } from "../../customers/[id]/_components/order-status-badge";
import { getPaymentSummary } from "@/lib/manager/payment-summary";
import {
  PaymentsPanel,
  type CashOrderView,
} from "./_components/payments-panel";
import { SaleDebtTerm } from "./_components/sale-debt-term";
import { NpTtnStatus } from "./_components/np-ttn-status";
import { CheckboxReceiptStatus } from "./_components/checkbox-receipt-status";
import { LinkedDocBanner } from "../../_components/linked-doc-banner";
import { BackButton } from "../../_components/back-button";
import { classifyDelivery } from "@/lib/manager/order-delivery";

export const dynamic = "force-dynamic";

async function getUsdRate(): Promise<number> {
  try {
    const latest = await prisma.exchangeRate.findFirst({
      where: { currencyFrom: "USD", currencyTo: "UAH" },
      orderBy: { date: "desc" },
    });
    return latest?.rate ?? 0;
  } catch {
    return 0;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const sale = await prisma.sale.findUnique({
    where: { id },
    select: { code1C: true, number1C: true, docNumber: true },
  });
  return {
    title: sale
      ? `Реалізація ${formatDocNumber(sale)} — L-TEX Manager`
      : "Реалізація — L-TEX Manager",
  };
}

export default async function ManagerSaleDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ pay?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/manager/login");

  const { id } = await params;
  const { pay } = await searchParams;
  // Етап 2: оплата тепер — повносторінкова форма; `?pay=1` редіректить на неї.
  if (pay === "1") redirect(`/manager/payments/new?saleId=${id}`);
  const ok = await canViewSale(user, id);
  if (!ok) notFound();

  const sale = await prisma.sale.findUnique({
    where: { id },
    include: {
      customer: {
        select: { id: true, name: true, code1C: true, phone: true, city: true },
      },
      order: {
        select: { id: true, code1C: true, number1C: true },
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
            select: { id: true, barcode: true },
          },
        },
      },
      checkboxReceipt: {
        select: { status: true, receiptId: true, error: true },
      },
    },
  });
  if (!sale) notFound();

  const editable = canEditSale(sale.status);
  const locked = isSaleLocked(sale.status);

  const [exchangeRateEur, exchangeRateUsd, mgr, cashOrders, paymentSummary] =
    await Promise.all([
      // Задача B: живий курс — лише дефолт/fallback. Форма редагування існуючої
      // реалізації нижче бере курс-знімок самого документа (sale.exchangeRateEur/
      // Usd), інакше документ переоцінився б сьогоднішнім курсом.
      getCurrentRate(),
      getUsdRate(),
      sale.customer.code1C
        ? prisma.mgrClient.findUnique({
            where: { code1C: sale.customer.code1C },
            select: {
              debt: true,
              phonePrimary: true,
              region: true,
              street: true,
              house: true,
              novaPoshtaBranch: true,
              npCityRef: true,
              npCityName: true,
              npWarehouseRef: true,
              npWarehouseName: true,
              npAddressMatchedAt: true,
            },
          })
        : Promise.resolve(null),
      prisma.mgrCashOrder.findMany({
        // Усі ордери реалізації (чернетки + проведені); зведення все одно рахує
        // лише проведені. Проведені тепер archived=true, тож фільтр прибрано.
        where: { saleId: sale.id },
        orderBy: { createdAt: "asc" },
      }),
      getPaymentSummary(sale.id),
    ]);

  const mgrAddress = mgr
    ? [mgr.street, mgr.house].filter(Boolean).join(", ") || null
    : null;

  // Способи доставки — з редагованого довідника (7.3).
  const [deliveryMethods, deliveryLabelOf, paymentRequisites] =
    await Promise.all([
      getDeliveryMethodOptions(),
      getDeliveryLabelResolver(),
      getActivePaymentRequisites(),
    ]);

  const clientSummary: ClientPickerItem = {
    id: sale.customer.id,
    code1C: sale.customer.code1C,
    name: sale.customer.name,
    tradePointName: null,
    city: sale.customer.city,
    region: mgr?.region ?? null,
    phone: sale.customer.phone ?? mgr?.phonePrimary ?? null,
    address: mgrAddress,
    debt: mgr?.debt?.toString() ?? "0",
    priceTypeId: sale.priceTypeId,
    deliveryMethodCode: sale.deliveryMethod,
    novaPoshtaBranch: mgr?.novaPoshtaBranch ?? null,
    npCityRef: mgr?.npCityRef ?? null,
    npCityName: mgr?.npCityName ?? null,
    npWarehouseRef: mgr?.npWarehouseRef ?? null,
    npWarehouseName: mgr?.npWarehouseName ?? null,
    npAddressMatched: mgr?.npAddressMatchedAt != null,
    agent: null,
    isOwned: true,
  };

  const itemDrafts: SaleItemDraft[] = sale.items.map((it) => ({
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
    lotId: it.lotId,
    barcode: it.barcode ?? it.lot?.barcode ?? null,
    weight: it.weight,
    quantity: it.quantity,
    pricePerKg: it.pricePerKg,
    priceEur: it.priceEur,
  }));

  const displayNumber = formatDocNumber(sale);

  const initialSale: SaleEditInitial = {
    id: sale.id,
    displayNumber,
    status: sale.status,
    notes: sale.notes ?? "",
    priceTypeId: sale.priceTypeId,
    deliveryMethod: sale.deliveryMethod,
    novaPoshtaBranch: sale.novaPoshtaBranch,
    npCityRef: sale.npCityRef,
    npCityName: sale.npCityName,
    npWarehouseRef: sale.npWarehouseRef,
    npWarehouseName: sale.npWarehouseName,
    npDeliveryType: sale.npDeliveryType,
    npRecipientName: sale.npRecipientName,
    npRecipientPhone: sale.npRecipientPhone,
    npPayerType: sale.npPayerType,
    declaredValueEnabled: sale.declaredValueEnabled,
    deliveryAddress: sale.deliveryAddress,
    cashOnDelivery: sale.cashOnDelivery,
    assignedAgentUserId: sale.assignedAgentUserId,
    onTradeAgent: sale.onTradeAgent,
    expressWaybill: sale.expressWaybill,
    items: itemDrafts,
  };

  const date = new Date(sale.createdAt).toLocaleString("uk-UA");

  // ─── Оплати (каса) ──────────────────────────────────────────────────────
  const dueUah = Math.round(sale.totalEur * sale.exchangeRateEur);
  // EUR-base зведення (порт 1С `ПолучитьДанныеПоОплате`, §E).
  const cashSummary = paymentSummary ?? {
    receivedUah: 0,
    changeUah: 0,
    balanceUah: dueUah,
    status: "debt" as const,
    byCurrency: {
      incomeUah: 0,
      incomeEur: 0,
      incomeUsd: 0,
      incomeUahCashless: 0,
      changeUah: 0,
      changeEur: 0,
      changeUsd: 0,
    },
    codAmountUah: Math.max(0, dueUah),
  };
  const cashOrderViews: CashOrderView[] = cashOrders.map((o) => ({
    id: o.id,
    type: o.type,
    status: o.status,
    amountUah: o.amountUah,
    amountEur: o.amountEur,
    amountUsd: o.amountUsd,
    amountUahCashless: o.amountUahCashless,
    changeForId: o.changeForId,
    bankAccount: o.bankAccount,
    cashFlowArticle: o.cashFlowArticle,
    comment: o.comment,
    createdAt: o.createdAt.toISOString(),
  }));

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <BackButton fallbackHref="/manager/sales" />

      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">
            Реалізація {displayNumber}
          </h1>
          <p className="mt-1 text-sm text-gray-500">Створено: {date}</p>
        </div>
        <div className="flex items-center gap-2">
          {!editable && <OrderStatusBadge status={sale.status} />}
          <DiscussButton
            docRef={{
              type: "sale",
              label: `Реалізація ${displayNumber}`,
              subtitle: sale.customer.name,
              url: `/manager/sales/${id}`,
            }}
          />
          <Link
            href={`/manager/sales/${id}/print`}
            target="_blank"
            className="rounded-md border border-gray-300 bg-white px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            📄 Видаткова накладна
          </Link>
        </div>
      </header>

      {sale.orderId && sale.order && (
        <LinkedDocBanner
          kind="order"
          href={`/manager/orders/${sale.order.id}`}
          number={`№${formatOrderNumber(sale.order)}`}
        />
      )}

      <SaleDebtTerm
        saleId={sale.id}
        cashOnDelivery={sale.cashOnDelivery}
        initialDebtTermDays={sale.debtTermDays}
      />

      {classifyDelivery(
        sale.deliveryMethod,
        deliveryLabelOf(sale.deliveryMethod),
      ) === "post" && (
        <NpTtnStatus
          saleId={sale.id}
          ttnRef={sale.ttnRef}
          ttnNumber={sale.expressWaybill}
          ttnError={sale.ttnError}
          posted={sale.status === "posted"}
        />
      )}

      {sale.cashOnDelivery && (
        <CheckboxReceiptStatus
          saleId={sale.id}
          status={sale.checkboxReceipt?.status ?? null}
          receiptId={sale.checkboxReceipt?.receiptId ?? null}
          error={sale.checkboxReceipt?.error ?? null}
          hasTtn={Boolean(sale.ttnRef) && Boolean(sale.expressWaybill)}
        />
      )}

      {editable ? (
        <SaleForm
          mode="edit"
          saleId={sale.id}
          initialSale={initialSale}
          initialClientId={sale.customer.id}
          initialClient={clientSummary}
          exchangeRateEur={
            sale.exchangeRateEur > 0 ? sale.exchangeRateEur : exchangeRateEur
          }
          exchangeRateUsd={
            sale.exchangeRateUsd > 0 ? sale.exchangeRateUsd : exchangeRateUsd
          }
          deliveryMethods={deliveryMethods}
          paymentRequisites={paymentRequisites}
          currentUserId={user.id}
          currentUserName={user.fullName}
          alreadyReceivedUah={cashSummary.receivedUah}
        />
      ) : (
        <ReadOnlySale
          sale={sale}
          deliveryLabel={deliveryLabelOf(sale.deliveryMethod)}
          locked={locked}
        />
      )}

      <PaymentsPanel
        saleId={sale.id}
        dueUah={dueUah}
        cashOnDelivery={sale.cashOnDelivery}
        codAmountUah={sale.codAmountUah}
        summary={cashSummary}
        orders={cashOrderViews}
      />
    </div>
  );
}

type SaleForView = NonNullable<Awaited<ReturnType<typeof loadSaleForView>>>;

async function loadSaleForView(id: string) {
  return prisma.sale.findUnique({
    where: { id },
    include: {
      customer: {
        select: { id: true, name: true, code1C: true, phone: true, city: true },
      },
      order: {
        select: { id: true, code1C: true, number1C: true },
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

function ReadOnlySale({
  sale,
  deliveryLabel,
  locked,
}: {
  sale: SaleForView;
  deliveryLabel: string;
  locked: boolean;
}) {
  return (
    <div className="space-y-6">
      <section className="rounded-lg border bg-white p-5">
        <p className="text-sm text-gray-500">
          {locked
            ? "Реалізацію проведено в 1С — редагування заборонено."
            : "Реалізацію скасовано — лише перегляд."}
        </p>
      </section>

      <section className="rounded-lg border bg-white p-5">
        <h2 className="text-base font-semibold text-gray-800">Клієнт</h2>
        <dl className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
          <Field label="Назва">
            <Link
              href={`/manager/customers/${sale.customer.id}`}
              className="text-blue-600 hover:text-blue-700"
            >
              {sale.customer.name}
            </Link>
          </Field>
          <Field label="Код 1С">
            <span className="font-mono">{sale.customer.code1C ?? "—"}</span>
          </Field>
          <Field label="Телефон">{sale.customer.phone ?? "—"}</Field>
          <Field label="Місто">{sale.customer.city ?? "—"}</Field>
          <Field label="Доставка">{deliveryLabel}</Field>
          <Field label="Наложка">{sale.cashOnDelivery ? "Так" : "Ні"}</Field>
        </dl>
      </section>

      <section className="rounded-lg border bg-white p-5">
        <h2 className="text-base font-semibold text-gray-800">
          Позиції ({sale.items.length})
        </h2>
        {sale.items.length === 0 ? (
          <p className="mt-3 text-sm text-gray-500">
            У реалізації немає позицій.
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
                  <th className="px-3 py-2 text-right font-medium">
                    Ціна/кг, €
                  </th>
                  <th className="px-3 py-2 text-right font-medium">Сума, €</th>
                </tr>
              </thead>
              <tbody>
                {sale.items.map((it) => (
                  <tr key={it.id} className="border-b last:border-b-0">
                    <td className="px-3 py-2 text-gray-800">
                      {it.product.name}
                    </td>
                    <td className="px-3 py-2 font-mono text-gray-600">
                      {it.lot?.barcode ?? it.barcode ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-right text-gray-700">
                      {it.weight.toFixed(2)}
                    </td>
                    <td className="px-3 py-2 text-right text-gray-700">
                      {it.quantity}
                    </td>
                    <td className="px-3 py-2 text-right text-gray-700">
                      {it.pricePerKg.toFixed(2)}
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
              {sale.totalEur.toFixed(2)} €
            </span>{" "}
            ·{" "}
            <span className="font-semibold text-gray-800">
              {Math.round(sale.totalUah).toLocaleString("uk-UA")} ₴
            </span>
          </span>
        </div>
      </section>

      {sale.notes && (
        <section className="rounded-lg border bg-white p-5">
          <h2 className="text-base font-semibold text-gray-800">Примітки</h2>
          <p className="mt-2 whitespace-pre-line text-sm text-gray-700">
            {sale.notes}
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
