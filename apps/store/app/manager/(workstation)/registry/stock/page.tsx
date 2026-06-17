import { redirect } from "next/navigation";
import { prisma, Prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import {
  buildOccurredAtFilter,
  fmtDateTime,
  fmtKg,
  toNum,
} from "@/lib/manager/registry-view";
import { ListPagination } from "../../customers/_components/list-pagination";
import { RegisterPeriodFilters } from "../_components/register-period-filters";
import { RegisterViewer } from "../../_components/register-viewer";

export const dynamic = "force-dynamic";
export const metadata = { title: "Регістр: Залишки товарів" };

const PAGE_SIZE = 50;
const ALLOWED = [
  "admin",
  "owner",
  "analyst",
  "supervisor",
  "bookkeeper",
  "manager",
] as const;

const COLUMNS = [
  { key: "occurredAt", label: "Дата", nowrap: true },
  { key: "productName", label: "Товар" },
  { key: "quality", label: "Якість", nowrap: true },
  { key: "qty", label: "К-сть", align: "right" as const, nowrap: true },
  { key: "weightKg", label: "Вага, кг", align: "right" as const, nowrap: true },
  { key: "kindLabel", label: "Рух", nowrap: true },
];

export default async function StockRegisterPage({
  searchParams,
}: {
  searchParams: Promise<{
    from?: string;
    to?: string;
    product?: string;
    kind?: string;
    page?: string;
  }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/manager/login");
  if (!(ALLOWED as readonly string[]).includes(user.role)) redirect("/manager");

  const sp = await searchParams;
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);

  const where: Prisma.StockMovementWhereInput = {};
  const occurredAt = buildOccurredAtFilter(sp.from, sp.to);
  if (occurredAt) where.occurredAt = occurredAt;
  if (sp.kind === "0" || sp.kind === "1") where.recordKind = Number(sp.kind);
  if (sp.product?.trim()) {
    const matches = await prisma.product.findMany({
      where: { name: { contains: sp.product.trim(), mode: "insensitive" } },
      select: { code1C: true },
      take: 500,
    });
    const codes = matches.map((p) => p.code1C).filter(Boolean) as string[];
    where.productCode1C = { in: codes.length ? codes : ["__none__"] };
  }

  const [total, movements] = await Promise.all([
    prisma.stockMovement.count({ where }),
    prisma.stockMovement.findMany({
      where,
      orderBy: { occurredAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        occurredAt: true,
        productCode1C: true,
        quality: true,
        qty: true,
        weightKg: true,
        recordKind: true,
      },
    }),
  ]);

  const productCodes = [
    ...new Set(movements.map((m) => m.productCode1C).filter(Boolean)),
  ] as string[];
  const products = productCodes.length
    ? await prisma.product.findMany({
        where: { code1C: { in: productCodes } },
        select: { code1C: true, name: true },
      })
    : [];
  const productName = new Map(
    products.map((p) => [p.code1C ?? "", p.name] as const),
  );

  const rows = movements.map((m) => ({
    id: m.id,
    occurredAt: fmtDateTime(m.occurredAt),
    productName: productName.get(m.productCode1C) || m.productCode1C,
    quality: m.quality ?? "—",
    qty: fmtKg(toNum(m.qty)),
    weightKg: m.weightKg == null ? "—" : fmtKg(toNum(m.weightKg)),
    kindLabel: m.recordKind === 1 ? "Розхід" : "Прихід",
  }));

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">
          Регістр: Залишки товарів
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Рухи складу шт + кг (1С AccumRg ТоварыНаСкладах). Усього рухів:{" "}
          {total}.
        </p>
      </div>

      <RegisterPeriodFilters
        initial={{
          from: sp.from ?? "",
          to: sp.to ?? "",
          product: sp.product ?? "",
          kind: sp.kind ?? "",
        }}
        extra={[
          { key: "product", label: "Товар", placeholder: "пошук за назвою" },
          {
            key: "kind",
            label: "Рух",
            options: [
              { value: "0", label: "Прихід" },
              { value: "1", label: "Розхід" },
            ],
          },
        ]}
      />

      <RegisterViewer
        columns={COLUMNS}
        rows={rows}
        csvFilename="stock-movements"
      />

      <ListPagination page={page} totalPages={totalPages} />
    </div>
  );
}
