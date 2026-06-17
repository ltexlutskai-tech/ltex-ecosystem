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
        clientId: true,
      },
    }),
  ]);

  // Резолв назв клієнтів/товарів батчем.
  const clientIds = [
    ...new Set(movements.map((m) => m.clientId).filter(Boolean)),
  ] as string[];
  const productCodes = [
    ...new Set(movements.map((m) => m.productCode1C).filter(Boolean)),
  ] as string[];
  const [clients, products] = await Promise.all([
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
  ]);
  const clientName = new Map(clients.map((c) => [c.id, c.name]));
  const productName = new Map(
    products.map((p) => [p.code1C ?? "", p.name] as const),
  );

  const rows = movements.map((m) => ({
    id: m.id,
    occurredAt: fmtDateTime(m.occurredAt),
    clientName: (m.clientId && clientName.get(m.clientId)) || "—",
    productName: (m.productCode1C && productName.get(m.productCode1C)) || "—",
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
