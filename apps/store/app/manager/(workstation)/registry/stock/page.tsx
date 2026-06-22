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
  { key: "docNo", label: "Документ", nowrap: true },
  { key: "warehouseName", label: "Склад" },
  { key: "productName", label: "Товар" },
  { key: "qualityName", label: "Якість", nowrap: true },
  { key: "qty", label: "К-сть", align: "right" as const, nowrap: true },
  { key: "weightKg", label: "Вага, кг", align: "right" as const, nowrap: true },
  { key: "kindLabel", label: "Рух", nowrap: true },
];

// Складські документи-реєстратори → маршрут перегляду /manager/stock-documents/<slug>/<id>.
const STOCK_DOC_SLUGS = [
  "product-returns",
  "warehouse-returns",
  "supplier-returns",
  "repackings",
  "write-offs",
  "stock-adjustments",
  "inventories",
  "stock-transfers",
] as const;

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
        productId: true,
        warehouseCode1C: true,
        quality: true,
        qty: true,
        weightKg: true,
        recordKind: true,
        recorderCode1C: true,
      },
    }),
  ]);

  // Унікальні коди для batch-резолву назв.
  const productCodes = [
    ...new Set(movements.map((m) => m.productCode1C).filter(Boolean)),
  ] as string[];
  const productIds = [
    ...new Set(movements.map((m) => m.productId).filter(Boolean)),
  ] as string[];
  const warehouseCodes = [
    ...new Set(movements.map((m) => m.warehouseCode1C).filter(Boolean)),
  ] as string[];
  const qualityCodes = [
    ...new Set(movements.map((m) => m.quality).filter(Boolean)),
  ] as string[];
  const recorderCodes = [
    ...new Set(movements.map((m) => m.recorderCode1C).filter(Boolean)),
  ] as string[];

  // Документ-реєстратор: реалізація (Sale) АБО один з 8 складських документів.
  const [
    productsByCode,
    productsById,
    warehouses,
    qualities,
    sales,
    ...stockDocLists
  ] = await Promise.all([
    productCodes.length
      ? prisma.product.findMany({
          where: { code1C: { in: productCodes } },
          select: { code1C: true, name: true },
        })
      : Promise.resolve([]),
    productIds.length
      ? prisma.product.findMany({
          where: { id: { in: productIds } },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
    warehouseCodes.length
      ? prisma.warehouse.findMany({
          where: { code1C: { in: warehouseCodes } },
          select: { code1C: true, name: true },
        })
      : Promise.resolve([]),
    qualityCodes.length
      ? prisma.quality.findMany({
          where: { code1C: { in: qualityCodes } },
          select: { code1C: true, name: true },
        })
      : Promise.resolve([]),
    recorderCodes.length
      ? prisma.sale.findMany({
          where: { code1C: { in: recorderCodes } },
          select: { id: true, code1C: true, number1C: true },
        })
      : Promise.resolve([]),
    // 8 складських документів — у тому ж порядку, що STOCK_DOC_SLUGS.
    recorderCodes.length
      ? prisma.productReturnFromCustomer.findMany({
          where: { code1C: { in: recorderCodes } },
          select: { id: true, code1C: true, number1C: true },
        })
      : Promise.resolve([]),
    recorderCodes.length
      ? prisma.warehouseReturn.findMany({
          where: { code1C: { in: recorderCodes } },
          select: { id: true, code1C: true, number1C: true },
        })
      : Promise.resolve([]),
    recorderCodes.length
      ? prisma.returnToSupplier.findMany({
          where: { code1C: { in: recorderCodes } },
          select: { id: true, code1C: true, number1C: true },
        })
      : Promise.resolve([]),
    recorderCodes.length
      ? prisma.repacking.findMany({
          where: { code1C: { in: recorderCodes } },
          select: { id: true, code1C: true, number1C: true },
        })
      : Promise.resolve([]),
    recorderCodes.length
      ? prisma.writeOff.findMany({
          where: { code1C: { in: recorderCodes } },
          select: { id: true, code1C: true, number1C: true },
        })
      : Promise.resolve([]),
    recorderCodes.length
      ? prisma.stockAdjustment.findMany({
          where: { code1C: { in: recorderCodes } },
          select: { id: true, code1C: true, number1C: true },
        })
      : Promise.resolve([]),
    recorderCodes.length
      ? prisma.inventory.findMany({
          where: { code1C: { in: recorderCodes } },
          select: { id: true, code1C: true, number1C: true },
        })
      : Promise.resolve([]),
    recorderCodes.length
      ? prisma.stockTransfer.findMany({
          where: { code1C: { in: recorderCodes } },
          select: { id: true, code1C: true, number1C: true },
        })
      : Promise.resolve([]),
  ]);

  const productNameByCode = new Map(
    productsByCode.map((p) => [p.code1C ?? "", p.name] as const),
  );
  const productNameById = new Map(productsById.map((p) => [p.id, p.name]));
  const warehouseName = new Map(
    warehouses.map((w) => [w.code1C ?? "", w.name] as const),
  );
  const qualityName = new Map(
    qualities.map((q) => [q.code1C ?? "", q.name] as const),
  );

  // Реєстратор → клікабельне посилання на документ.
  const docByCode = new Map<string, { text: string; href: string }>();
  for (const s of sales)
    if (s.code1C)
      docByCode.set(s.code1C, {
        text: s.number1C ?? "Реалізація",
        href: `/manager/sales/${s.id}`,
      });
  stockDocLists.forEach((list, idx) => {
    const slug = STOCK_DOC_SLUGS[idx];
    for (const d of list)
      if (d.code1C && !docByCode.has(d.code1C))
        docByCode.set(d.code1C, {
          text: d.number1C ?? "Документ",
          href: `/manager/stock-documents/${slug}/${d.id}`,
        });
  });

  // Короткий хвіст hex, коли назва/документ не знайдені.
  const short = (h: string | null) => (h ? `…${h.slice(-6)}` : "—");

  const rows = movements.map((m) => ({
    id: m.id,
    occurredAt: fmtDateTime(m.occurredAt),
    docNo:
      (m.recorderCode1C && docByCode.get(m.recorderCode1C)) ||
      short(m.recorderCode1C),
    warehouseName:
      (m.warehouseCode1C && warehouseName.get(m.warehouseCode1C)) ||
      short(m.warehouseCode1C),
    productName:
      (m.productId && productNameById.get(m.productId)) ||
      (m.productCode1C && productNameByCode.get(m.productCode1C)) ||
      short(m.productCode1C),
    qualityName: (m.quality && qualityName.get(m.quality)) || short(m.quality),
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
