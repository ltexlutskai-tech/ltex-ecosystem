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
  { key: "accountName", label: "Рахунок / Каса" },
  { key: "docNo", label: "Документ", nowrap: true },
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
        accountCode1C: true,
        recorderCode1C: true,
        amountUah: true,
        amountUpr: true,
      },
    }),
  ]);

  const articleCodes = [
    ...new Set(movements.map((m) => m.articleCode1C).filter(Boolean)),
  ] as string[];
  const accountCodes = [
    ...new Set(movements.map((m) => m.accountCode1C).filter(Boolean)),
  ] as string[];
  const recorderCodes = [
    ...new Set(movements.map((m) => m.recorderCode1C).filter(Boolean)),
  ] as string[];

  // Документ-реєстратор може бути касовим ордером АБО банк-платіжкою.
  const [articles, accounts, cashOrders, bankIn, bankOut] = await Promise.all([
    articleCodes.length
      ? prisma.mgrCashFlowArticle.findMany({
          where: { code1C: { in: articleCodes } },
          select: { code1C: true, name: true },
        })
      : Promise.resolve([]),
    accountCodes.length
      ? prisma.mgrBankAccount.findMany({
          where: { code1C: { in: accountCodes } },
          select: { code1C: true, name: true },
        })
      : Promise.resolve([]),
    recorderCodes.length
      ? prisma.mgrCashOrder.findMany({
          where: { code1C: { in: recorderCodes } },
          select: { id: true, code1C: true, number1C: true },
        })
      : Promise.resolve([]),
    recorderCodes.length
      ? prisma.bankPaymentIncoming.findMany({
          where: { code1C: { in: recorderCodes } },
          select: { id: true, code1C: true, number1C: true },
        })
      : Promise.resolve([]),
    recorderCodes.length
      ? prisma.bankPaymentOutgoing.findMany({
          where: { code1C: { in: recorderCodes } },
          select: { id: true, code1C: true, number1C: true },
        })
      : Promise.resolve([]),
  ]);

  const articleName = new Map(
    articles.map((a) => [a.code1C ?? "", a.name] as const),
  );
  const accountName = new Map(
    accounts.map((a) => [a.code1C ?? "", a.name] as const),
  );
  // Мапа реєстратор → клікабельне посилання на документ.
  const docByCode = new Map<string, { text: string; href: string }>();
  for (const o of cashOrders)
    if (o.code1C)
      docByCode.set(o.code1C, {
        text: o.number1C ?? "ПКО/РКО",
        href: `/manager/payments/${o.id}`,
      });
  for (const b of bankIn)
    if (b.code1C)
      docByCode.set(b.code1C, {
        text: b.number1C ?? "Платіжка вх.",
        href: `/manager/bank-payments-incoming/${b.id}`,
      });
  for (const b of bankOut)
    if (b.code1C)
      docByCode.set(b.code1C, {
        text: b.number1C ?? "Платіжка вих.",
        href: `/manager/bank-payments-outgoing/${b.id}`,
      });

  const short = (h: string | null) => (h ? `…${h.slice(-6)}` : "—");

  const rows = movements.map((m) => ({
    id: m.id,
    occurredAt: fmtDateTime(m.occurredAt),
    directionLabel: m.direction === 1 ? "Розхід" : "Прихід",
    articleName:
      (m.articleCode1C && articleName.get(m.articleCode1C)) || "Без статті",
    accountName:
      (m.accountCode1C && accountName.get(m.accountCode1C)) ||
      short(m.accountCode1C),
    docNo:
      (m.recorderCode1C && docByCode.get(m.recorderCode1C)) ||
      short(m.recorderCode1C),
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
