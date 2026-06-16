import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { formatDocNumber } from "@/lib/manager/order-number";

export const dynamic = "force-dynamic";
export const metadata = { title: "Касовий ордер — L-TEX Manager" };

function fmt(n: number) {
  return n.toLocaleString("uk-UA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
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

export default async function ManagerCashOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/manager/login");

  const { id } = await params;

  const order = await prisma.mgrCashOrder.findUnique({
    where: { id },
    include: {
      customer: { select: { id: true, name: true, code1C: true } },
      sale: {
        select: { id: true, code1C: true, number1C: true, docNumber: true },
      },
      bankAccountRef: { select: { name: true } },
      cashFlowArticleRef: { select: { name: true } },
    },
  });

  if (!order) notFound();

  const isIncome = order.type === "income";
  const displayNumber = formatDocNumber(order);
  const date = new Date(order.paidAt).toLocaleString("uk-UA");

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        href="/manager/payments"
        className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900"
      >
        <ArrowLeft className="h-4 w-4" />
        Назад до оплат
      </Link>

      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">
            Касовий ордер {displayNumber}
          </h1>
          <p className="mt-1 text-sm text-gray-500">{date}</p>
        </div>
        <span
          className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-medium ${
            isIncome
              ? "bg-green-100 text-green-700"
              : "bg-orange-100 text-orange-700"
          }`}
        >
          {isIncome ? "Приход" : "Розхід"}
        </span>
      </header>

      {/* ─── Деталі ──────────────────────────────────────────────────────── */}
      <section className="rounded-lg border bg-white p-5">
        <h2 className="mb-3 text-base font-semibold text-gray-800">Деталі</h2>
        <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          <Field label="Вид">
            {isIncome ? "Приход (ПКО)" : "Розхід (РКО)"}
          </Field>

          <Field label="Клієнт">
            {order.customer ? (
              <Link
                href={`/manager/customers/${order.customer.id}`}
                className="text-blue-600 hover:text-blue-700"
              >
                {order.customer.name}
              </Link>
            ) : (
              "—"
            )}
          </Field>

          <Field label="Реалізація">
            {order.sale ? (
              <Link
                href={`/manager/sales/${order.sale.id}`}
                className="text-blue-600 hover:text-blue-700"
              >
                {formatDocNumber(order.sale)}
              </Link>
            ) : (
              "—"
            )}
          </Field>

          <Field label="Стаття руху коштів">
            {order.cashFlowArticleRef?.name ?? "—"}
          </Field>

          <Field label="Банк-рахунок">
            {order.bankAccountRef?.name ?? "—"}
          </Field>

          {order.routeSheetId && (
            <Field label="Маршрутний лист">
              <Link
                href={`/manager/routes/${order.routeSheetId}`}
                className="text-blue-600 hover:text-blue-700"
              >
                Переглянути →
              </Link>
            </Field>
          )}
        </dl>
      </section>

      {/* ─── Суми ────────────────────────────────────────────────────────── */}
      <section className="rounded-lg border bg-white p-5">
        <h2 className="mb-3 text-base font-semibold text-gray-800">Суми</h2>

        <div className="mb-4">
          <p className="text-xs uppercase tracking-wide text-gray-400">
            Сума документа
          </p>
          <p className="mt-1 text-2xl font-bold text-gray-900">
            {fmt(order.documentSumEur)} €
          </p>
        </div>

        <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          <Field label="Готівка UAH">{fmt(order.amountUah)} ₴</Field>

          {order.amountUahCashless > 0 && (
            <Field label="Безготівка UAH">
              {fmt(order.amountUahCashless)} ₴
            </Field>
          )}

          {order.amountEur > 0 && (
            <Field label="EUR">{fmt(order.amountEur)} €</Field>
          )}

          {order.amountUsd > 0 && (
            <Field label="USD">{fmt(order.amountUsd)} $</Field>
          )}

          <Field label="Курс EUR">{fmt(order.rateEur)}</Field>

          {order.rateUsd > 0 && (
            <Field label="Курс USD">{fmt(order.rateUsd)}</Field>
          )}

          {order.debtCorrection !== 0 && (
            <Field label="Корекція боргу">{fmt(order.debtCorrection)} ₴</Field>
          )}
        </dl>
      </section>

      {/* ─── Примітка ────────────────────────────────────────────────────── */}
      {order.comment && (
        <section className="rounded-lg border bg-white p-5">
          <h2 className="mb-2 text-base font-semibold text-gray-800">
            Примітка
          </h2>
          <p className="whitespace-pre-line text-sm text-gray-700">
            {order.comment}
          </p>
        </section>
      )}
    </div>
  );
}
