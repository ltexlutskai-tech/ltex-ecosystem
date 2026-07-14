import Link from "next/link";
import { Button } from "@ltex/ui";
import type { PaymentSummary } from "@/lib/manager/payment-summary";
import { PaymentDeleteButton } from "./payment-delete-button";

export interface CashOrderView {
  id: string;
  type: string; // income | expense
  amountUah: number;
  amountEur: number;
  amountUsd: number;
  amountUahCashless: number;
  changeForId: string | null;
  bankAccount: string | null;
  cashFlowArticle: string | null;
  comment: string | null;
  createdAt: string;
}

function uah(n: number): string {
  return `${Math.round(n).toLocaleString("uk-UA")} ₴`;
}

/** Перелік ненульових сум ордера як «50 € · 200 ₴ (безнал)». */
function amountParts(o: CashOrderView): string {
  const parts: string[] = [];
  if (o.amountUah) parts.push(`${o.amountUah.toLocaleString("uk-UA")} ₴`);
  if (o.amountUahCashless)
    parts.push(`${o.amountUahCashless.toLocaleString("uk-UA")} ₴ (безнал)`);
  if (o.amountEur) parts.push(`${o.amountEur.toFixed(2)} €`);
  if (o.amountUsd) parts.push(`${o.amountUsd.toFixed(2)} $`);
  return parts.length ? parts.join(" · ") : "—";
}

/**
 * Блок «Оплати / Каса» — Етап 2. Панель оплат на сторінці реалізації:
 * EUR-base зведення (`getPaymentSummary`, §E): Отримано / Решта / Залишок
 * (борг/переплата) + статус + наложка (`codAmountUah`) + список касових
 * ордерів. Кнопка «Оплата» веде на повносторінкову форму
 * (`/manager/payments/new?saleId=…`) — модалка прибрана (Етап 2).
 */
export function PaymentsPanel({
  saleId,
  dueUah,
  cashOnDelivery,
  codAmountUah,
  summary,
  orders,
}: {
  saleId: string;
  /** Сума реалізації у грн за знімком (для рядка «До оплати»). */
  dueUah: number;
  cashOnDelivery: boolean;
  codAmountUah: number | null;
  summary: PaymentSummary;
  orders: CashOrderView[];
}) {
  const balance = summary.balanceUah;
  const balanceLabel =
    balance > 0
      ? cashOnDelivery
        ? "Наложка"
        : "Борг"
      : balance < 0
        ? "Переплата"
        : "Сплачено повністю";

  return (
    <section
      id="payments"
      className="scroll-mt-20 rounded-lg border bg-white p-5 shadow-sm"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-gray-800">Оплати (каса)</h2>
        <Button
          asChild
          size="sm"
          className="bg-blue-600 text-white hover:bg-blue-700"
        >
          <Link href={`/manager/payments/new?saleId=${saleId}`}>Оплата</Link>
        </Button>
      </div>

      <dl className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-4">
        <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
          <dt className="text-xs uppercase tracking-wide text-gray-400">
            До оплати
          </dt>
          <dd className="mt-0.5 font-semibold text-gray-900">{uah(dueUah)}</dd>
        </div>
        <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
          <dt className="text-xs uppercase tracking-wide text-gray-400">
            Отримано
          </dt>
          <dd className="mt-0.5 font-semibold text-gray-900">
            {uah(summary.receivedUah)}
          </dd>
        </div>
        <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
          <dt className="text-xs uppercase tracking-wide text-gray-400">
            Решта
          </dt>
          <dd className="mt-0.5 font-semibold text-gray-900">
            {uah(summary.changeUah)}
          </dd>
        </div>
        <div
          className={`rounded-md border px-3 py-2 ${
            balance > 0
              ? "border-amber-200 bg-amber-50"
              : balance < 0
                ? "border-blue-200 bg-blue-50"
                : "border-green-200 bg-green-50"
          }`}
        >
          <dt className="text-xs uppercase tracking-wide text-gray-400">
            {balanceLabel}
          </dt>
          <dd className="mt-0.5 font-semibold text-gray-900">
            {uah(Math.abs(balance))}
          </dd>
        </div>
      </dl>

      {cashOnDelivery && codAmountUah !== null && (
        <p className="mt-2 text-sm text-amber-800">
          Сума післяплати:{" "}
          <span className="font-semibold">{uah(codAmountUah)}</span>
        </p>
      )}

      <div className="mt-4">
        {orders.length === 0 ? (
          <p className="text-sm text-gray-500">Оплат ще немає.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="px-3 py-2 font-medium">Тип</th>
                  <th className="px-3 py-2 font-medium">Суми</th>
                  <th className="px-3 py-2 font-medium">Стаття</th>
                  <th className="px-3 py-2 font-medium">Дата</th>
                  <th className="px-3 py-2 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id} className="border-b last:border-b-0">
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                          o.type === "expense"
                            ? "bg-red-100 text-red-700"
                            : "bg-green-100 text-green-700"
                        }`}
                      >
                        {o.type === "expense" ? "Розхід (здача)" : "Прихід"}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-gray-800">
                      {amountParts(o)}
                    </td>
                    <td className="px-3 py-2 text-gray-600">
                      {o.cashFlowArticle ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-gray-500">
                      {new Date(o.createdAt).toLocaleString("uk-UA")}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {/* Розхід-здача видаляється разом з приходом — кнопку
                          показуємо лише на приході. */}
                      {o.type !== "expense" && (
                        <PaymentDeleteButton cashOrderId={o.id} />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
