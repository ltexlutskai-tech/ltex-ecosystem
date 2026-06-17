import { notFound } from "next/navigation";
import { prisma, Prisma } from "@ltex/db";
import { requireRole } from "@/lib/auth/manager-auth";
import { parseDateParam, fmtKg, fmtDate } from "@/lib/manager/registry-view";
import {
  summarizeStockBalance,
  totalStock,
  type StockGroupBy,
  type StockMovementLite,
} from "@/lib/reports/registry-reports";
import { ReportsNav } from "../_components/reports-nav";
import { RegisterPeriodFilters } from "../../registry/_components/register-period-filters";
import { RegisterViewer } from "../../_components/register-viewer";

export const dynamic = "force-dynamic";
export const metadata = { title: "Звіт: Залишки складу | L-TEX" };

const GROUP_OPTIONS: { value: StockGroupBy; label: string }[] = [
  { value: "product", label: "По товарах" },
  { value: "quality", label: "По якості" },
];

const COLUMNS = [
  { key: "label", label: "Назва" },
  { key: "qty", label: "К-сть, шт", align: "right" as const, nowrap: true },
  { key: "weightKg", label: "Вага, кг", align: "right" as const, nowrap: true },
];

const LIMIT = 50000;

export default async function StockBalancePage({
  searchParams,
}: {
  searchParams: Promise<{ to?: string; group?: string }>;
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
  const group: StockGroupBy = GROUP_OPTIONS.some((g) => g.value === sp.group)
    ? (sp.group as StockGroupBy)
    : "product";

  // Залишок на дату = усі рухи до кінця дня `to` (за замовчуванням — на сьогодні).
  const asOf = parseDateParam(sp.to);
  const where: Prisma.StockMovementWhereInput = {};
  if (asOf) {
    const end = new Date(asOf);
    end.setHours(23, 59, 59, 999);
    where.occurredAt = { lte: end };
  }

  const movements = await prisma.stockMovement.findMany({
    where,
    take: LIMIT,
    select: {
      productCode1C: true,
      quality: true,
      qty: true,
      weightKg: true,
      recordKind: true,
    },
  });

  const productCodes = [...new Set(movements.map((m) => m.productCode1C))];
  const products = productCodes.length
    ? await prisma.product.findMany({
        where: { code1C: { in: productCodes } },
        select: { code1C: true, name: true },
      })
    : [];
  const productName = new Map(
    products.map((p) => [p.code1C ?? "", p.name] as const),
  );

  const lite: StockMovementLite[] = movements.map((m) => ({
    productCode1C: m.productCode1C,
    productName: productName.get(m.productCode1C) ?? null,
    quality: m.quality,
    qty: Number(m.qty),
    weightKg: m.weightKg == null ? null : Number(m.weightKg),
    recordKind: m.recordKind,
  }));

  const summary = summarizeStockBalance(lite, group);
  const grand = totalStock(summary);

  const rows = summary.map((r) => ({
    id: r.key,
    label: r.label,
    qty: fmtKg(r.qty),
    weightKg: fmtKg(r.weightKg),
  }));

  const asOfLabel = asOf ? fmtDate(asOf) : "сьогодні";

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <ReportsNav />
      <div>
        <h1 className="text-xl font-semibold text-gray-900">
          Звіт: Залишки складу
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Залишки шт + кг × товар / якість станом на {asOfLabel}. Рухів у
          вибірці: {movements.length}
          {movements.length >= LIMIT ? ` (показано перші ${LIMIT})` : ""}.
        </p>
      </div>

      <RegisterPeriodFilters
        initial={{ to: sp.to ?? "", group }}
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
        csvFilename="stock-balance"
        emptyMessage="Залишків на обрану дату немає."
        summary={
          rows.length > 0 ? (
            <div className="flex flex-wrap gap-6 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm">
              <span>
                Разом шт: <strong>{fmtKg(grand.qty)}</strong>
              </span>
              <span>
                Разом кг: <strong>{fmtKg(grand.weightKg)} кг</strong>
              </span>
            </div>
          ) : null
        }
      />
    </div>
  );
}
