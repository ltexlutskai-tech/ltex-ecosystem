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

export const dynamic = "force-dynamic";
export const metadata = { title: "Переміщення готівки — L-TEX Manager" };

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
  const doc = await prisma.cashTransfer.findUnique({
    where: { id },
    include: {
      fromAccountRef: { select: { name: true } },
      toAccountRef: { select: { name: true } },
      cashFlowArticleRef: { select: { name: true } },
    },
  });
  if (!doc) notFound();

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="text-sm">
        <Link
          href="/manager/cash-transfers"
          className="text-gray-500 hover:text-gray-800 hover:underline"
        >
          ← До списку
        </Link>
      </div>

      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">
          Переміщення готівки {formatDocNo(doc.number1C, doc.docNumber)}
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

      <div className="grid grid-cols-2 gap-4 rounded-md border bg-white p-4 sm:grid-cols-3">
        <Field
          label="Дата"
          value={doc.transferredAt.toLocaleDateString("uk-UA")}
        />
        <Field
          label="З рахунку"
          value={doc.fromAccountRef?.name ?? "Готівкова каса"}
        />
        <Field
          label="На рахунок"
          value={doc.toAccountRef?.name ?? "Готівкова каса"}
        />
        <Field label="Сума" value={fmtAmount(doc.amount, doc.currency)} />
        <Field label="У EUR" value={fmtEur(doc.amountEur)} />
        <Field
          label="Курс EUR"
          value={doc.rateEur > 0 ? doc.rateEur.toFixed(4) : "—"}
        />
        <Field label="Стаття ДДС" value={doc.cashFlowArticleRef?.name} />
      </div>

      {doc.comment && (
        <div className="rounded-md border bg-white p-4">
          <div className="text-xs uppercase tracking-wide text-gray-400">
            Коментар
          </div>
          <p className="mt-1 text-sm text-gray-800">{doc.comment}</p>
        </div>
      )}
    </div>
  );
}
