import { redirect } from "next/navigation";
import { prisma, Prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import {
  buildOccurredAtFilter,
  fmtDateTime,
  fmtKg,
  toNum,
} from "@/lib/manager/registry-view";
import { formatDocNumber } from "@/lib/manager/order-number";
import { ListPagination } from "../../customers/_components/list-pagination";
import { RegisterPeriodFilters } from "../_components/register-period-filters";
import { RegisterViewer } from "../../_components/register-viewer";

export const dynamic = "force-dynamic";
export const metadata = { title: "Регістр: Залишки замовлень" };

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
  { key: "orderLabel", label: "Замовлення", nowrap: true },
  { key: "productName", label: "Товар" },
  { key: "qty", label: "К-сть", align: "right" as const, nowrap: true },
  { key: "kindLabel", label: "Рух", nowrap: true },
];

export default async function OrderRemainderRegisterPage({
  searchParams,
}: {
  searchParams: Promise<{
    from?: string;
    to?: string;
    kind?: string;
    page?: string;
  }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/manager/login");
  if (!(ALLOWED as readonly string[]).includes(user.role)) redirect("/manager");

  const sp = await searchParams;
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);

  const where: Prisma.OrderRemainderMovementWhereInput = {};
  const occurredAt = buildOccurredAtFilter(sp.from, sp.to);
  if (occurredAt) where.occurredAt = occurredAt;
  if (sp.kind === "0" || sp.kind === "1") where.recordKind = Number(sp.kind);

  const [total, movements] = await Promise.all([
    prisma.orderRemainderMovement.count({ where }),
    prisma.orderRemainderMovement.findMany({
      where,
      orderBy: { occurredAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        occurredAt: true,
        orderCode1C: true,
        productCode1C: true,
        productId: true,
        qty: true,
        recordKind: true,
      },
    }),
  ]);

  // Резолв назв батчем: замовлення (по code1C), товар (по id АБО code1C).
  const orderCodes = [
    ...new Set(movements.map((m) => m.orderCode1C).filter(Boolean)),
  ] as string[];
  const productCodes = [
    ...new Set(movements.map((m) => m.productCode1C).filter(Boolean)),
  ] as string[];
  const productIds = [
    ...new Set(movements.map((m) => m.productId).filter(Boolean)),
  ] as string[];
  const [orders, productsByCode, productsById] = await Promise.all([
    orderCodes.length
      ? prisma.order.findMany({
          where: { code1C: { in: orderCodes } },
          select: { id: true, number1C: true, code1C: true },
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
  ]);
  const orderByCode = new Map(orders.map((o) => [o.code1C ?? "", o]));
  const productNameByCode = new Map(
    productsByCode.map((p) => [p.code1C ?? "", p.name] as const),
  );
  const productNameById = new Map(productsById.map((p) => [p.id, p.name]));

  // Короткий хвіст hex, коли документ не знайдено (щоб не було порожньо).
  const short = (h: string | null) => (h ? `…${h.slice(-6)}` : "—");

  const rows = movements.map((m) => {
    const order = m.orderCode1C ? orderByCode.get(m.orderCode1C) : undefined;
    return {
      id: m.id,
      occurredAt: fmtDateTime(m.occurredAt),
      // Клікабельне посилання на замовлення, якщо знайдено; інакше короткий код.
      orderLabel: order
        ? {
            text: formatDocNumber({
              number1C: order.number1C,
              code1C: order.code1C,
            }),
            href: `/manager/orders/${order.id}`,
          }
        : short(m.orderCode1C),
      productName:
        (m.productId && productNameById.get(m.productId)) ||
        (m.productCode1C && productNameByCode.get(m.productCode1C)) ||
        "—",
      qty: fmtKg(toNum(m.qty)),
      kindLabel: m.recordKind === 1 ? "Закрито" : "Замовлено",
    };
  });

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">
          Регістр: Залишки замовлень
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Рухи незакритих замовлень (1С AccumRg ЗаказыПокупателей). Усього
          рухів: {total}.
        </p>
      </div>

      <RegisterPeriodFilters
        initial={{
          from: sp.from ?? "",
          to: sp.to ?? "",
          kind: sp.kind ?? "",
        }}
        extra={[
          {
            key: "kind",
            label: "Рух",
            options: [
              { value: "0", label: "Замовлено" },
              { value: "1", label: "Закрито" },
            ],
          },
        ]}
      />

      <RegisterViewer
        columns={COLUMNS}
        rows={rows}
        csvFilename="order-remainder-movements"
      />

      <ListPagination page={page} totalPages={totalPages} />
    </div>
  );
}
