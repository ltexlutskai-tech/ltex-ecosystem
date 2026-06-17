import { notFound } from "next/navigation";
import { prisma, Prisma } from "@ltex/db";
import { requireRole } from "@/lib/auth/manager-auth";
import {
  buildOccurredAtFilter,
  fmtEur,
  fmtKg,
} from "@/lib/manager/registry-view";
import {
  summarizeSales,
  totalSales,
  type SalesGroupBy,
  type SalesMovementLite,
} from "@/lib/reports/registry-reports";
import { ReportsNav } from "../_components/reports-nav";
import { RegisterPeriodFilters } from "../../registry/_components/register-period-filters";
import { RegisterViewer } from "../../_components/register-viewer";

export const dynamic = "force-dynamic";
export const metadata = { title: "Звіт: Підсумок продажів | L-TEX" };

const GROUP_OPTIONS: { value: SalesGroupBy; label: string }[] = [
  { value: "client", label: "По клієнтах" },
  { value: "product", label: "По товарах" },
  { value: "agent", label: "По агентах" },
];

const COLUMNS = [
  { key: "label", label: "Назва" },
  { key: "qty", label: "К-сть", align: "right" as const, nowrap: true },
  { key: "weightKg", label: "Вага, кг", align: "right" as const, nowrap: true },
  {
    key: "revenueEur",
    label: "Виручка, €",
    align: "right" as const,
    nowrap: true,
  },
  {
    key: "discountEur",
    label: "Знижки, €",
    align: "right" as const,
    nowrap: true,
  },
];

const LIMIT = 5000;

export default async function SalesSummaryPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; group?: string }>;
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
  const group: SalesGroupBy = GROUP_OPTIONS.some((g) => g.value === sp.group)
    ? (sp.group as SalesGroupBy)
    : "client";

  const where: Prisma.SalesMovementWhereInput = {};
  const occurredAt = buildOccurredAtFilter(sp.from, sp.to);
  if (occurredAt) where.occurredAt = occurredAt;

  const movements = await prisma.salesMovement.findMany({
    where,
    take: LIMIT,
    select: {
      clientCode1C: true,
      clientId: true,
      productCode1C: true,
      agentCode1C: true,
      qty: true,
      weightKg: true,
      revenueEur: true,
      revenueNoDiscountEur: true,
      recordKind: true,
    },
  });

  // Резолв назв для груп.
  const clientIds = [
    ...new Set(movements.map((m) => m.clientId).filter(Boolean)),
  ] as string[];
  const productCodes = [
    ...new Set(movements.map((m) => m.productCode1C).filter(Boolean)),
  ] as string[];
  const agentCodes = [
    ...new Set(movements.map((m) => m.agentCode1C).filter(Boolean)),
  ] as string[];
  const [clients, products, agents] = await Promise.all([
    clientIds.length
      ? prisma.mgrClient.findMany({
          where: { id: { in: clientIds } },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
    productCodes.length
      ? prisma.product.findMany({
          where: { code1C: { in: productCodes } },
          select: { code1C: true, name: true },
        })
      : Promise.resolve([]),
    agentCodes.length
      ? prisma.user.findMany({
          where: { code1C: { in: agentCodes } },
          select: { code1C: true, fullName: true },
        })
      : Promise.resolve([]),
  ]);
  const clientName = new Map(clients.map((c) => [c.id, c.name]));
  const productName = new Map(
    products.map((p) => [p.code1C ?? "", p.name] as const),
  );
  const agentName = new Map(
    agents.map((a) => [a.code1C ?? "", a.fullName] as const),
  );

  const lite: SalesMovementLite[] = movements.map((m) => ({
    clientCode1C: m.clientCode1C,
    clientName: m.clientId ? (clientName.get(m.clientId) ?? null) : null,
    productCode1C: m.productCode1C,
    productName: m.productCode1C
      ? (productName.get(m.productCode1C) ?? null)
      : null,
    agentCode1C: m.agentCode1C,
    agentName: m.agentCode1C ? (agentName.get(m.agentCode1C) ?? null) : null,
    qty: Number(m.qty),
    weightKg: m.weightKg == null ? null : Number(m.weightKg),
    revenueEur: Number(m.revenueEur),
    revenueNoDiscountEur:
      m.revenueNoDiscountEur == null ? null : Number(m.revenueNoDiscountEur),
    recordKind: m.recordKind,
  }));

  const summary = summarizeSales(lite, group);
  const grand = totalSales(summary);

  const rows = summary.map((r) => ({
    id: r.key,
    label: r.label,
    qty: fmtKg(r.qty),
    weightKg: fmtKg(r.weightKg),
    revenueEur: fmtEur(r.revenueEur),
    discountEur: fmtEur(r.discountEur),
  }));

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <ReportsNav />
      <div>
        <h1 className="text-xl font-semibold text-gray-900">
          Звіт: Підсумок продажів
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Виручка / кг у розрізі клієнтів · товарів · агентів за період. Рухів у
          вибірці: {movements.length}
          {movements.length >= LIMIT ? ` (показано перші ${LIMIT})` : ""}.
        </p>
      </div>

      <RegisterPeriodFilters
        initial={{ from: sp.from ?? "", to: sp.to ?? "", group }}
        extra={[
          {
            key: "group",
            label: "Групування",
            options: GROUP_OPTIONS.map((g) => ({
              value: g.value,
              label: g.label,
            })),
          },
        ]}
      />

      <RegisterViewer
        columns={COLUMNS}
        rows={rows}
        csvFilename="sales-summary"
        emptyMessage="За обраним періодом продажів немає."
        summary={
          rows.length > 0 ? (
            <div className="flex flex-wrap gap-6 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm">
              <span>
                Разом виручка: <strong>{fmtEur(grand.revenueEur)} €</strong>
              </span>
              <span>
                Разом вага: <strong>{fmtKg(grand.weightKg)} кг</strong>
              </span>
              <span>
                Знижки: <strong>{fmtEur(grand.discountEur)} €</strong>
              </span>
            </div>
          ) : null
        }
      />
    </div>
  );
}
