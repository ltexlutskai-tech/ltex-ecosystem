import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { getCurrentRate } from "@/lib/exchange-rate";
import { canViewSale } from "@/lib/manager/sale-ownership";
import { getOwnedClientIds } from "@/lib/manager/client-visibility";
import {
  PaymentForm,
  type BankAccountOption,
  type CashFlowArticleOption,
  type PaymentFormMode,
} from "./_components/payment-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Нова оплата — L-TEX Manager" };

/** Останній курс USD→UAH (0 коли відсутній). */
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

/**
 * Блок «Оплати / Каса» — Етап 2. Сторінка оплати (порт 1С обробки «Оплата»).
 *
 * Підстава визначається query:
 *  • `?saleId` — оплата по реалізації (preset сума/курси/клієнт, ownership-гард);
 *  • `?clientId` — погашення боргу клієнта (preset борг, ownership-гард);
 *  • без параметрів — вільна оплата (клієнт обирається у формі).
 */
export default async function NewPaymentPage({
  searchParams,
}: {
  searchParams: Promise<{ saleId?: string; clientId?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/manager/login");

  const sp = await searchParams;

  // Довідники (тільки активні) — для select-ів банк. рахунку / статті.
  const [bankRows, articleRows, fallbackEur, fallbackUsd] = await Promise.all([
    prisma.mgrBankAccount.findMany({
      where: { archived: false },
      orderBy: { name: "asc" },
      select: { id: true, name: true, hiddenInApp: true },
    }),
    prisma.mgrCashFlowArticle.findMany({
      where: { archived: false },
      orderBy: { name: "asc" },
      select: { id: true, code: true, name: true, parentId: true },
    }),
    getCurrentRate(),
    getUsdRate(),
  ]);

  const bankAccounts: BankAccountOption[] = bankRows;
  const cashFlowArticles: CashFlowArticleOption[] = articleRows;

  let mode: PaymentFormMode = "standalone";
  let saleId: string | null = null;
  let clientId: string | null = null;
  let presetSumToPayEur: number | null = null;
  let presetRateEur = fallbackEur;
  let presetRateUsd = fallbackUsd;
  let clientLabel: string | null = null;
  let clientDebtEur: number | null = null;
  let returnHref: string | null = null;

  if (sp.saleId) {
    const ok = await canViewSale(user, sp.saleId);
    if (!ok) notFound();
    const sale = await prisma.sale.findUnique({
      where: { id: sp.saleId },
      select: {
        id: true,
        totalEur: true,
        exchangeRateEur: true,
        exchangeRateUsd: true,
        customer: { select: { name: true } },
      },
    });
    if (!sale) notFound();
    mode = "sale";
    saleId = sale.id;
    presetSumToPayEur = sale.totalEur;
    presetRateEur =
      sale.exchangeRateEur > 0 ? sale.exchangeRateEur : fallbackEur;
    presetRateUsd =
      sale.exchangeRateUsd > 0 ? sale.exchangeRateUsd : fallbackUsd;
    clientLabel = sale.customer.name;
    returnHref = `/manager/sales/${sale.id}`;
  } else if (sp.clientId) {
    const client = await prisma.mgrClient.findUnique({
      where: { id: sp.clientId },
      select: { id: true, name: true, debt: true },
    });
    if (!client) notFound();
    // Ownership: admin → null (усі); manager → лише свої.
    const owned = await getOwnedClientIds(user);
    if (owned !== null && !owned.has(client.id)) notFound();
    mode = "client";
    clientId = client.id;
    clientLabel = client.name;
    const debt = Number(client.debt);
    clientDebtEur = Number.isFinite(debt) && debt > 0 ? debt : 0;
    presetSumToPayEur = clientDebtEur;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        href="/manager/payments"
        className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900"
      >
        <ArrowLeft className="h-4 w-4" />
        Назад до списку
      </Link>

      <header>
        <h1 className="text-2xl font-bold text-gray-800">Оплата</h1>
        <p className="mt-1 text-sm text-gray-500">
          Внесіть отримані суми у валютах та (за потреби) решту. Після
          «Сформувати» створиться касовий ордер.
        </p>
      </header>

      <PaymentForm
        mode={mode}
        saleId={saleId}
        clientId={clientId}
        presetSumToPayEur={presetSumToPayEur}
        presetRateEur={presetRateEur}
        presetRateUsd={presetRateUsd}
        clientLabel={clientLabel}
        clientDebtEur={clientDebtEur}
        bankAccounts={bankAccounts}
        cashFlowArticles={cashFlowArticles}
        returnHref={returnHref}
      />
    </div>
  );
}
