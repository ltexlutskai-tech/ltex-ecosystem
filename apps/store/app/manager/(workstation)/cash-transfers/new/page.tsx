import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@ltex/db";
import { requireRole } from "@/lib/auth/manager-auth";
import { getCurrentRate } from "@/lib/exchange-rate";
import { CashTransferForm } from "../../_components/treasury/cash-transfer-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Нове переміщення готівки — L-TEX Manager" };

export default async function NewCashTransferPage() {
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
      <Link
        href="/manager/cash-transfers"
        className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900"
      >
        <ArrowLeft className="h-4 w-4" />
        Назад до списку
      </Link>

      <header>
        <h1 className="text-2xl font-bold text-gray-800">
          Нове переміщення готівки
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Інкасація каса↔банк або переміщення каса↔каса. Після створення —
          «Провести», щоб зафіксувати два рухи коштів (розхід + прихід).
        </p>
      </header>

      <CashTransferForm
        basePath="/api/v1/manager/cash-transfers"
        listPath="/manager/cash-transfers"
        bankAccounts={bankAccounts}
        articles={articles}
        defaultRateEur={defaultRateEur}
      />
    </div>
  );
}
