import { redirect } from "next/navigation";
import { prisma, Prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import {
  buildOccurredAtFilter,
  fmtDateTime,
  fmtEur,
  toNum,
} from "@/lib/manager/registry-view";
import { ListPagination } from "../../customers/_components/list-pagination";
import { RegisterPeriodFilters } from "../_components/register-period-filters";
import { RegisterViewer } from "../../_components/register-viewer";

export const dynamic = "force-dynamic";
export const metadata = { title: "Регістр: Рух коштів (ДДС)" };

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
  { key: "directionLabel", label: "Вид", nowrap: true },
  { key: "articleName", label: "Стаття" },
  { key: "amountUah", label: "Сума, ₴", align: "right" as const, nowrap: true },
  { key: "amountUpr", label: "Сума, €", align: "right" as const, nowrap: true },
];

export default async function CashFlowRegisterPage({
  searchParams,
}: {
  searchParams: Promise<{
    from?: string;
    to?: string;
    direction?: string;
    page?: string;
  }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/manager/login");
  if (!(ALLOWED as readonly string[]).includes(user.role)) redirect("/manager");

  const sp = await searchParams;
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);

  const where: Prisma.CashFlowMovementWhereInput = {};
  const occurredAt = buildOccurredAtFilter(sp.from, sp.to);
  if (occurredAt) where.occurredAt = occurredAt;
  if (sp.direction === "0" || sp.direction === "1") {
    where.direction = Number(sp.direction);
  }

  const [total, movements] = await Promise.all([
    prisma.cashFlowMovement.count({ where }),
    prisma.cashFlowMovement.findMany({
      where,
      orderBy: { occurredAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        occurredAt: true,
        direction: true,
        articleCode1C: true,
        amountUah: true,
        amountUpr: true,
      },
    }),
  ]);

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

  const rows = movements.map((m) => ({
    id: m.id,
    occurredAt: fmtDateTime(m.occurredAt),
    directionLabel: m.direction === 1 ? "Розхід" : "Прихід",
    articleName:
      (m.articleCode1C && articleName.get(m.articleCode1C)) || "Без статті",
    amountUah: toNum(m.amountUah).toFixed(2),
    amountUpr: m.amountUpr == null ? "—" : fmtEur(toNum(m.amountUpr)),
  }));

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">
          Регістр: Рух коштів (ДДС)
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Надходження та витрати (1С AccumRg ДвиженияДенежныхСредств). Усього
          рухів: {total}.
        </p>
      </div>

      <RegisterPeriodFilters
        initial={{
          from: sp.from ?? "",
          to: sp.to ?? "",
          direction: sp.direction ?? "",
        }}
        extra={[
          {
            key: "direction",
            label: "Вид",
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
        csvFilename="cashflow-movements"
      />

      <ListPagination page={page} totalPages={totalPages} />
    </div>
  );
}
