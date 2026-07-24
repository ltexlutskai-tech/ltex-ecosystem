import { redirect } from "next/navigation";
import { Prisma, prisma } from "@ltex/db";
import { requireRole } from "@/lib/auth/manager-auth";
import { isMonoConfigured } from "@/lib/bank/monobank";
import { MONO_CLIENT_INFO_AT_KEY } from "@/lib/bank/ingest";
import { AutoRefresh } from "../_components/auto-refresh";
import { EmptyState } from "../_components/empty-state";
import { ListPagination } from "../customers/_components/list-pagination";
import { FeedAccountLink } from "./_components/feed-account-link";
import { WebhookSetupButton } from "./_components/webhook-setup-button";

export const dynamic = "force-dynamic";
export const metadata = { title: "Банк — рухи по рахунках — L-TEX Manager" };

const PAGE_SIZE = 50;

const CURRENCY_SYMBOL: Record<string, string> = {
  UAH: "₴",
  EUR: "€",
  USD: "$",
};

function fmtMoney(value: number, currency: string): string {
  const num = new Intl.NumberFormat("uk-UA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
  return `${num} ${CURRENCY_SYMBOL[currency] ?? currency}`;
}

function fmtDateTime(d: Date): string {
  return d.toLocaleString("uk-UA", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function one(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

/**
 * «Банк» — стрічка рухів по рахунках з банківського фіда + залишки наживо.
 * Крок 1 інтеграції банкінгу (Monobank webhook + фонове опитування).
 * Доступ — фінансовий контур (bookkeeper/admin/owner).
 */
export default async function BankFeedPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireRole(["bookkeeper", "admin", "owner"]);
  if (!user) redirect("/manager");

  const sp = await searchParams;
  const page = Math.max(1, parseInt(one(sp.page) ?? "1", 10) || 1);
  const accountId = one(sp.account) || undefined;
  const dir = one(sp.dir);
  const q = one(sp.q)?.trim() || undefined;

  const where: Prisma.BankTransactionWhereInput = {};
  if (accountId) where.feedAccountId = accountId;
  if (dir === "in") where.amount = { gt: 0 };
  else if (dir === "out") where.amount = { lt: 0 };
  if (q) {
    where.OR = [
      { counterName: { contains: q, mode: "insensitive" } },
      { comment: { contains: q, mode: "insensitive" } },
      { description: { contains: q, mode: "insensitive" } },
      { counterIban: { contains: q, mode: "insensitive" } },
      { counterEdrpou: { contains: q, mode: "insensitive" } },
    ];
  }

  const [accounts, mgrAccounts, items, total, clientInfoSetting] =
    await Promise.all([
      prisma.bankFeedAccount.findMany({
        where: { archived: false },
        orderBy: [{ provider: "asc" }, { currencyCode: "asc" }],
        include: { mgrBankAccount: { select: { id: true, name: true } } },
      }),
      prisma.mgrBankAccount.findMany({
        where: { archived: false, kind: { in: ["account", "card"] } },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      }),
      prisma.bankTransaction.findMany({
        where,
        orderBy: { occurredAt: "desc" },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        include: {
          feedAccount: { select: { title: true, currencyCode: true } },
        },
      }),
      prisma.bankTransaction.count({ where }),
      prisma.mgrSetting.findUnique({
        where: { key: MONO_CLIENT_INFO_AT_KEY },
      }),
    ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const monoConfigured = isMonoConfigured();
  const lastSyncAt = clientInfoSetting
    ? new Date(clientInfoSetting.value)
    : null;

  return (
    <div className="max-w-none space-y-4">
      <AutoRefresh intervalMs={30_000} />

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-800">
            Банк — рухи по рахунках
          </h1>
          <p className="mt-1 text-sm text-gray-600">
            Виписка з банків наживо · операцій в архіві: {total}
            {lastSyncAt && !Number.isNaN(lastSyncAt.getTime())
              ? ` · рахунки оновлено ${fmtDateTime(lastSyncAt)}`
              : ""}
          </p>
        </div>
        {monoConfigured ? (
          <WebhookSetupButton
            label={
              accounts.length > 0
                ? "🔄 Перепідключити вебхук"
                : "🔗 Підключити Monobank"
            }
          />
        ) : null}
      </header>

      {!monoConfigured ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <p className="font-semibold">Monobank ще не підключено.</p>
          <p className="mt-1">
            Додайте у <code>apps/store/.env</code> змінні{" "}
            <code>MONOBANK_TOKEN</code> (згенерувати на api.monobank.ua) і{" "}
            <code>MONOBANK_WEBHOOK_SECRET</code>, перезапустіть сайт — і
            натисніть «Підключити Monobank» на цій сторінці.
          </p>
        </div>
      ) : null}

      {/* Залишки по рахунках */}
      {accounts.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {accounts.map((a) => (
            <div key={a.id} className="rounded-md border bg-white p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-xs font-medium uppercase tracking-wide text-gray-500">
                  {a.provider === "monobank" ? "Monobank" : a.provider} ·{" "}
                  {a.title ?? "рахунок"}
                </span>
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-600">
                  {a.currencyCode}
                </span>
              </div>
              <p className="mt-1.5 text-xl font-bold tabular-nums text-gray-900">
                {a.balance !== null
                  ? fmtMoney(Number(a.balance), a.currencyCode)
                  : "—"}
              </p>
              <p className="mt-0.5 text-xs text-gray-400">
                {a.iban ? `${a.iban} · ` : ""}
                {a.balanceAt ? `станом на ${fmtDateTime(a.balanceAt)}` : ""}
              </p>
              <FeedAccountLink
                feedAccountId={a.id}
                current={a.mgrBankAccount?.id ?? null}
                options={mgrAccounts}
              />
            </div>
          ))}
        </div>
      ) : null}

      {/* Фільтри */}
      <form
        method="GET"
        className="flex flex-wrap items-end gap-2 rounded-md border bg-white p-3 text-sm"
      >
        <label className="flex flex-col gap-1">
          <span className="text-xs text-gray-500">Рахунок</span>
          <select
            name="account"
            defaultValue={accountId ?? ""}
            className="h-9 rounded border border-gray-300 px-2"
          >
            <option value="">Усі рахунки</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.title ?? a.externalId} ({a.currencyCode})
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-gray-500">Напрям</span>
          <select
            name="dir"
            defaultValue={dir ?? ""}
            className="h-9 rounded border border-gray-300 px-2"
          >
            <option value="">Усі</option>
            <option value="in">Надходження</option>
            <option value="out">Списання</option>
          </select>
        </label>
        <label className="flex min-w-[220px] flex-1 flex-col gap-1">
          <span className="text-xs text-gray-500">
            Пошук (платник / призначення / IBAN / ЄДРПОУ)
          </span>
          <input
            type="text"
            name="q"
            defaultValue={q ?? ""}
            placeholder="Напр.: Мельник або L0002477"
            className="h-9 rounded border border-gray-300 px-2"
          />
        </label>
        <button
          type="submit"
          className="h-9 rounded-md bg-emerald-600 px-4 font-medium text-white hover:bg-emerald-700"
        >
          Фільтрувати
        </button>
      </form>

      {/* Стрічка операцій */}
      {items.length === 0 ? (
        <EmptyState
          message="Операцій поки немає"
          hint={
            monoConfigured
              ? "Щойно по рахунку буде рух — він зʼявиться тут автоматично."
              : "Підключіть Monobank, щоб бачити рухи по рахунках наживо."
          }
        />
      ) : (
        <>
          <div className="overflow-x-auto rounded-md border bg-white">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-3 py-2">Дата</th>
                  <th className="px-3 py-2">Рахунок</th>
                  <th className="px-3 py-2">Платник / отримувач</th>
                  <th className="px-3 py-2">Призначення</th>
                  <th className="px-3 py-2 text-right">Сума</th>
                  <th className="px-3 py-2 text-right">Залишок після</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {items.map((t) => {
                  const amount = Number(t.amount);
                  const isIncome = amount > 0;
                  return (
                    <tr key={t.id} className="hover:bg-gray-50">
                      <td className="whitespace-nowrap px-3 py-2 text-gray-600">
                        {fmtDateTime(t.occurredAt)}
                        {t.hold ? (
                          <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                            блок
                          </span>
                        ) : null}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-gray-500">
                        {t.feedAccount.title ?? "—"} (
                        {t.feedAccount.currencyCode})
                      </td>
                      <td className="px-3 py-2">
                        <span className="font-medium text-gray-800">
                          {t.counterName ?? "—"}
                        </span>
                        {t.counterEdrpou || t.counterIban ? (
                          <span className="block text-xs text-gray-400">
                            {[t.counterEdrpou, t.counterIban]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                        ) : null}
                      </td>
                      <td className="max-w-[320px] px-3 py-2 text-gray-600">
                        {[t.comment, t.description]
                          .filter(Boolean)
                          .join(" · ") || "—"}
                      </td>
                      <td
                        className={`whitespace-nowrap px-3 py-2 text-right font-semibold tabular-nums ${
                          isIncome ? "text-emerald-700" : "text-gray-700"
                        }`}
                      >
                        {isIncome ? "+" : ""}
                        {fmtMoney(amount, t.currencyCode)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-gray-400">
                        {t.balanceAfter !== null
                          ? fmtMoney(Number(t.balanceAfter), t.currencyCode)
                          : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <ListPagination page={page} totalPages={totalPages} />
        </>
      )}
    </div>
  );
}
