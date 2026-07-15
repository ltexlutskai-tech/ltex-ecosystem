import { redirect } from "next/navigation";
import { prisma } from "@ltex/db";
import { requireRole } from "@/lib/auth/manager-auth";
import { getCurrentRate } from "@/lib/exchange-rate";
import { BackButton } from "../../_components/back-button";
import { BankPaymentForm } from "../../_components/treasury/bank-payment-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Нова вхідна платіжка — L-TEX Manager" };

export default async function NewBankPaymentIncomingPage() {
  const user = await requireRole(["bookkeeper", "admin", "owner"]);
  if (!user) redirect("/manager");

  const [bankAccounts, articles, defaultRateEur] = await Promise.all([
    prisma.mgrBankAccount.findMany({
      where: { archived: false },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.mgrCashFlowArticle.findMany({
      where: { archived: false },
      orderBy: { name: "asc" },
      select: { id: true, code: true, name: true },
    }),
    getCurrentRate(),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <BackButton fallbackHref="/manager/bank-payments-incoming" />

      <header>
        <h1 className="text-2xl font-bold text-gray-800">
          Нова вхідна платіжка
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Надходження безналу від клієнта. Після створення — «Провести», щоб
          зафіксувати рух коштів і зменшити борг клієнта.
        </p>
      </header>

      <BankPaymentForm
        direction="incoming"
        basePath="/api/v1/manager/bank-payments-incoming"
        listPath="/manager/bank-payments-incoming"
        bankAccounts={bankAccounts}
        articles={articles}
        defaultRateEur={defaultRateEur}
      />
    </div>
  );
}
