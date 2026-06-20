import { redirect } from "next/navigation";
import { prisma, Prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import {
  buildOccurredAtFilter,
  fmtDateTime,
  fmtEur,
  fmtKg,
  toNum,
} from "@/lib/manager/registry-view";
import { ListPagination } from "../../customers/_components/list-pagination";
import { RegisterPeriodFilters } from "../_components/register-period-filters";
import { RegisterViewer } from "../../_components/register-viewer";

export const dynamic = "force-dynamic";
export const metadata = { title: "Регістр: Продажі" };

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
  { key: "clientName", label: "Клієнт" },
  { key: "productName", label: "Товар" },
  { key: "orderNo", label: "Замовлення", nowrap: true },
  { key: "saleNo", label: "Документ продажу", nowrap: true },
  { key: "qty", label: "К-сть", align: "right" as const, nowrap: true },
  { key: "weightKg", label: "Вага, кг", align: "right" as const, nowrap: true },
  {
    key: "revenueEur",
    label: "Виручка, €",
    align: "right" as const,
    nowrap: true,
  },
  { key: "kindLabel", label: "Вид", nowrap: true },
];

export default async function SalesRegisterPage({
  searchParams,
}: {
  searchParams: Promise<{
    from?: string;
    to?: string;
    client?: string;
    product?: string;
    page?: string;
  }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/manager/login");
  if (!(ALLOWED as readonly string[]).includes(user.role)) redirect("/manager");

  const sp = await searchParams;
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);

  const where: Prisma.SalesMovementWhereInput = {};
  const occurredAt = buildOccurredAtFilter(sp.from, sp.to);
  if (occurredAt) where.occurredAt = occurredAt;
  if (sp.client?.trim()) {
    // Регістр зберігає clientId (плоский скаляр, без FK-relation) — резолвимо
    // пошук за іменем у список id.
    const matches = await prisma.mgrClient.findMany({
      where: { name: { contains: sp.client.trim(), mode: "insensitive" } },
      select: { id: true },
      take: 500,
    });
    where.clientId = {
      in: matches.length ? matches.map((c) => c.id) : ["__none__"],
    };
  }

  const [total, movements] = await Promise.all([
    prisma.salesMovement.count({ where }),
    prisma.salesMovement.findMany({
      where,
      orderBy: { occurredAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        occurredAt: true,
        qty: true,
        weightKg: true,
        revenueEur: true,
        recordKind: true,
        productCode1C: true,
        productId: true,
        clientId: true,
        orderCode1C: true,
        saleCode1C: true,
      },
    }),
  ]);

  // Резолв назв батчем: клієнт, товар (по id АБО code1C), замовлення, документ продажу.
  const clientIds = [
    ...new Set(movements.map((m) => m.clientId).filter(Boolean)),
  ] as string[];
  const productCodes = [
    ...new Set(movements.map((m) => m.productCode1C).filter(Boolean)),
  ] as string[];
  const productIds = [
    ...new Set(movements.map((m) => m.productId).filter(Boolean)),
  ] as string[];
  const orderCodes = [
    ...new Set(movements.map((m) => m.orderCode1C).filter(Boolean)),
  ] as string[];
  const saleCodes = [
    ...new Set(movements.map((m) => m.saleCode1C).filter(Boolean)),
  ] as string[];

  const [clients, productsByCode, productsById, orders, sales] =
    await Promise.all([
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
      productIds.length
        ? prisma.product.findMany({
            where: { id: { in: productIds } },
            select: { id: true, name: true },
          })
        : Promise.resolve([]),
      orderCodes.length
        ? prisma.order.findMany({
            where: { code1C: { in: orderCodes } },
            select: { code1C: true, number1C: true },
          })
        : Promise.resolve([]),
      saleCodes.length
        ? prisma.sale.findMany({
            where: { code1C: { in: saleCodes } },
            select: { code1C: true, number1C: true },
          })
        : Promise.resolve([]),
    ]);
  const clientName = new Map(clients.map((c) => [c.id, c.name]));
  const productNameByCode = new Map(
    productsByCode.map((p) => [p.code1C ?? "", p.name] as const),
  );
  const productNameById = new Map(productsById.map((p) => [p.id, p.name]));
  const orderNo = new Map(orders.map((o) => [o.code1C ?? "", o.number1C]));
  const saleNo = new Map(sales.map((s) => [s.code1C ?? "", s.number1C]));

  // Короткий хвіст hex, коли документ не знайдено (щоб не було порожньо).
  const short = (h: string | null) => (h ? `…${h.slice(-6)}` : "—");

  const rows = movements.map((m) => ({
    id: m.id,
    occurredAt: fmtDateTime(m.occurredAt),
    clientName: (m.clientId && clientName.get(m.clientId)) || "—",
    productName:
      (m.productId && productNameById.get(m.productId)) ||
      (m.productCode1C && productNameByCode.get(m.productCode1C)) ||
      "—",
    orderNo:
      (m.orderCode1C && (orderNo.get(m.orderCode1C) ?? short(m.orderCode1C))) ||
      "—",
    saleNo:
      (m.saleCode1C && (saleNo.get(m.saleCode1C) ?? short(m.saleCode1C))) ||
      "—",
    qty: fmtKg(toNum(m.qty)),
    weightKg: m.weightKg == null ? "—" : fmtKg(toNum(m.weightKg)),
    revenueEur: fmtEur(toNum(m.revenueEur)),
    kindLabel: m.recordKind === 1 ? "Повернення" : "Продаж",
  }));

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">
          Регістр: Продажі
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Обороти продажів (1С AccumRg Продажи). Усього рухів: {total}.
        </p>
      </div>

      <RegisterPeriodFilters
        initial={{
          from: sp.from ?? "",
          to: sp.to ?? "",
          client: sp.client ?? "",
        }}
        extra={[
          { key: "client", label: "Клієнт", placeholder: "пошук за іменем" },
        ]}
      />

      <RegisterViewer
        columns={COLUMNS}
        rows={rows}
        csvFilename="sales-movements"
      />

      <ListPagination page={page} totalPages={totalPages} />
    </div>
  );
}
