import { notFound, redirect } from "next/navigation";
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
import { BackButton } from "../../_components/back-button";

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
  searchParams: Promise<{
    saleId?: string;
    clientId?: string;
    routeSheetId?: string;
    sumToPayEur?: string;
  }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/manager/login");

  const sp = await searchParams;

  // МЛ-контекст: коли оплату створюють зсередини Маршрутного листа. Перевіряємо
  // існування МЛ (інакше ігноруємо), щоб після збереження повернути на сторінку
  // МЛ та проставити зворотне посилання `MgrCashOrder.routeSheetId`.
  let routeSheetId: string | null = null;
  if (sp.routeSheetId) {
    const sheet = await prisma.routeSheet.findUnique({
      where: { id: sp.routeSheetId },
      select: { id: true },
    });
    if (sheet) routeSheetId = sheet.id;
  }

  // Довідники (тільки активні) — для select-ів банк. рахунку / статті.
  const [bankRows, articleRows, fallbackEur, fallbackUsd] = await Promise.all([
    prisma.mgrBankAccount.findMany({
      // У безготівці показуємо ЛИШЕ банк-рахунки (не карти й не каси).
      where: { archived: false, kind: "account" },
      orderBy: { name: "asc" },
      select: { id: true, name: true, hiddenInApp: true },
    }),
    prisma.mgrCashFlowArticle.findMany({
      where: { archived: false },
      orderBy: { name: "asc" },
      select: {
        id: true,
        code: true,
        name: true,
        parentId: true,
        direction: true,
      },
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
    // У МЛ-контексті клієнт може приходити як `Customer.id` (рядок Оплати) —
    // спершу пробуємо Customer, далі MgrClient (стандартний шлях боргу).
    const customer = routeSheetId
      ? await prisma.customer.findUnique({
          where: { id: sp.clientId },
          select: { id: true, name: true, code1C: true },
        })
      : null;
    if (customer) {
      const mgr = customer.code1C
        ? await prisma.mgrClient.findUnique({
            where: { code1C: customer.code1C },
            select: { id: true, debt: true },
          })
        : null;
      mode = "client";
      // PaymentForm чекає MgrClient.id у `clientId`; резолвимо через code1C.
      clientId = mgr?.id ?? null;
      clientLabel = customer.name;
      const debt = mgr ? Number(mgr.debt) : 0;
      clientDebtEur = Number.isFinite(debt) && debt > 0 ? debt : 0;
      presetSumToPayEur = clientDebtEur;
    }
  }
  // Стандартний шлях по MgrClient.id (поза МЛ або коли Customer не знайдено).
  if (mode === "standalone" && sp.clientId && !clientId) {
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

  // МЛ-контекст: повертаємось на сторінку Маршрутного листа (переважає над
  // деталлю реалізації) + дозволяємо `?sumToPayEur` preset з рядка реалізації.
  if (routeSheetId) {
    returnHref = `/manager/routes/${routeSheetId}`;
    const sumParsed = sp.sumToPayEur ? Number(sp.sumToPayEur) : NaN;
    if (Number.isFinite(sumParsed) && sumParsed >= 0) {
      presetSumToPayEur = sumParsed;
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <BackButton
        label={routeSheetId ? "Назад до маршруту" : "Назад до списку"}
        fallbackHref={returnHref ?? "/manager/payments"}
      />

      <header>
        <h1 className="text-2xl font-bold text-gray-800">Оплата</h1>
        <p className="mt-1 text-sm text-gray-500">
          Внесіть отримані суми у валютах та (за потреби) решту. «Зберегти» —
          чернетка без проведення; «Провести» — рух коштів + борг.
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
        userRole={user.role}
        returnHref={returnHref}
        routeSheetId={routeSheetId}
      />
    </div>
  );
}
