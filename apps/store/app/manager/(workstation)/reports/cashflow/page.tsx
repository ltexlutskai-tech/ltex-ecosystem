import { notFound } from "next/navigation";
import { prisma, Prisma } from "@ltex/db";
import { requireRole } from "@/lib/auth/manager-auth";
import { buildOccurredAtFilter } from "@/lib/manager/registry-view";
import {
  summarizeCashFlow,
  totalCashFlow,
  type CashFlowMovementLite,
} from "@/lib/reports/registry-reports";
import { ReportsNav } from "../_components/reports-nav";
import { ReportExportButtons } from "../_components/report-export-buttons";
import { RegisterPeriodFilters } from "../../registry/_components/register-period-filters";
import { RegisterViewer } from "../../_components/register-viewer";

export const dynamic = "force-dynamic";
export const metadata = { title: "Звіт: Рух коштів (ДДС) | L-TEX" };

const COLUMNS = [
  { key: "label", label: "Стаття" },
  {
    key: "inflowUah",
    label: "Прихід, ₴",
    align: "right" as const,
    nowrap: true,
  },
  {
    key: "outflowUah",
    label: "Розхід, ₴",
    align: "right" as const,
    nowrap: true,
  },
  { key: "netUah", label: "Сальдо, ₴", align: "right" as const, nowrap: true },
];

const LIMIT = 20000;

function uah(n: number): string {
  return n.toFixed(2);
}

export default async function CashFlowReportPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const user = await requireRole([
    "analyst",
    "admin",
    "owner",
    "supervisor",
    "bookkeeper",
  ]);
  if (!user) notFound();

  const sp = await searchParams;
  const where: Prisma.CashFlowMovementWhereInput = {};
  const occurredAt = buildOccurredAtFilter(sp.from, sp.to);
  if (occurredAt) where.occurredAt = occurredAt;

  const movements = await prisma.cashFlowMovement.findMany({
    where,
    take: LIMIT,
    select: {
      articleCode1C: true,
      direction: true,
      amountUah: true,
      amountUpr: true,
    },
  });

  const articleCodes = [
    ...new Set(movements.map((m) => m.articleCode1C).filter(Boolean)),
  ] as string[];
  const articles = articleCodes.length
    ? await prisma.mgrCashFlowArticle.findMany({
        where: { code1C: { in: articleCodes } },
        select: { code1C: true, name: true },
      })
    : [];
  const articleName = new Map(
    articles.map((a) => [a.code1C ?? "", a.name] as const),
  );

  const lite: CashFlowMovementLite[] = movements.map((m) => ({
    articleCode1C: m.articleCode1C,
    articleName: m.articleCode1C
      ? (articleName.get(m.articleCode1C) ?? null)
      : null,
    direction: m.direction,
    amountUah: Number(m.amountUah),
    amountUpr: m.amountUpr == null ? null : Number(m.amountUpr),
  }));

  const summary = summarizeCashFlow(lite);
  const grand = totalCashFlow(summary);

  const rows = summary.map((r) => ({
    id: r.key,
    label: r.label,
    inflowUah: uah(r.inflowUah),
    outflowUah: uah(r.outflowUah),
    netUah: uah(r.netUah),
  }));

  const exportQuery = new URLSearchParams({
    ...(sp.from ? { from: sp.from } : {}),
    ...(sp.to ? { to: sp.to } : {}),
  }).toString();

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <ReportsNav />
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">
            Звіт: Рух коштів (ДДС)
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Прихід / розхід / сальдо по статтях руху коштів за період. Рухів у
            вибірці: {movements.length}
            {movements.length >= LIMIT ? ` (показано перші ${LIMIT})` : ""}.
          </p>
        </div>
        <ReportExportButtons reportId="cashflow" query={exportQuery} />
      </div>

      <RegisterPeriodFilters
        initial={{ from: sp.from ?? "", to: sp.to ?? "" }}
      />

      <RegisterViewer
        columns={COLUMNS}
        rows={rows}
        csvFilename="cashflow-report"
        emptyMessage="За обраним періодом руху коштів немає."
        summary={
          rows.length > 0 ? (
            <div className="flex flex-wrap gap-6 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm">
              <span>
                Прихід: <strong>{uah(grand.inflowUah)} ₴</strong>
              </span>
              <span>
                Розхід: <strong>{uah(grand.outflowUah)} ₴</strong>
              </span>
              <span>
                Сальдо:{" "}
                <strong
                  className={
                    grand.netUah >= 0 ? "text-emerald-700" : "text-red-600"
                  }
                >
                  {uah(grand.netUah)} ₴
                </strong>
              </span>
            </div>
          ) : null
        }
      />
    </div>
  );
}
