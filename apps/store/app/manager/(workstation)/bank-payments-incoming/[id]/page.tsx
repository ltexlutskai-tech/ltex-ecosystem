import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@ltex/db";
import { requireRole } from "@/lib/auth/manager-auth";
import {
  docStatusClass,
  docStatusLabel,
  fmtAmount,
  fmtEur,
  formatDocNo,
} from "@/lib/manager/financial-docs";
import { canManageTreasury } from "@/lib/manager/treasury-permission";
import { TreasuryDocActions } from "../../_components/treasury/treasury-doc-actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Платіжне доручення вхідне — L-TEX Manager" };

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-gray-400">
        {label}
      </div>
      <div className="mt-0.5 text-sm text-gray-800">{value || "—"}</div>
    </div>
  );
}

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireRole(["bookkeeper", "admin", "owner"]);
  if (!user) redirect("/manager");

  const { id } = await params;
  const doc = await prisma.bankPaymentIncoming.findUnique({
    where: { id },
    include: {
      customer: { select: { id: true, name: true } },
      bankAccountRef: { select: { name: true, description: true } },
      cashFlowArticleRef: { select: { name: true } },
    },
  });
  if (!doc) notFound();

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="text-sm">
        <Link
          href="/manager/bank-payments-incoming"
          className="text-gray-500 hover:text-gray-800 hover:underline"
        >
          ← До списку
        </Link>
      </div>

      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">
          Платіжка вхідна {formatDocNo(doc.number1C, doc.docNumber)}
        </h1>
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-medium ${docStatusClass(
            doc.status,
          )}`}
        >
          {docStatusLabel(doc.status)}
          {doc.archived ? " · архів" : ""}
        </span>
      </header>

      <TreasuryDocActions
        basePath="/api/v1/manager/bank-payments-incoming"
        listPath="/manager/bank-payments-incoming"
        id={doc.id}
        status={doc.status}
        canDelete={canManageTreasury(user.role)}
      />

      <div className="grid grid-cols-2 gap-4 rounded-md border bg-white p-4 sm:grid-cols-3">
        <Field label="Дата" value={doc.paidAt.toLocaleDateString("uk-UA")} />
        <Field
          label="Контрагент"
          value={
            doc.customer ? (
              <Link
                href={`/manager/customers/${doc.customer.id}`}
                className="text-emerald-700 hover:underline"
              >
                {doc.customer.name}
              </Link>
            ) : (
              "—"
            )
          }
        />
        <Field label="Сума" value={fmtAmount(doc.amount, doc.currency)} />
        <Field label="У EUR" value={fmtEur(doc.amountEur)} />
        <Field
          label="Курс EUR"
          value={doc.rateEur > 0 ? doc.rateEur.toFixed(4) : "—"}
        />
        <Field label="Рахунок L-TEX" value={doc.bankAccountRef?.name} />
        <Field label="IBAN платника" value={doc.iban} />
        <Field label="Стаття ДДС" value={doc.cashFlowArticleRef?.name} />
        <Field label="Призначення" value={doc.purpose} />
      </div>

      {doc.comment && (
        <div className="rounded-md border bg-white p-4">
          <div className="text-xs uppercase tracking-wide text-gray-400">
            Коментар
          </div>
          <p className="mt-1 text-sm text-gray-800">{doc.comment}</p>
        </div>
      )}

      <p className="text-xs text-gray-400">
        Проведення вхідної платіжки зменшує борг контрагента (рух
        взаєморозрахунків).
      </p>
    </div>
  );
}
