import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/manager-auth";
import { getMyClientCodes1C } from "@/lib/manager/order-ownership";
import {
  PRODUCT_GROUP_LABEL,
  type ProductGroup,
} from "@/lib/manager/product-group";
import {
  getManagerSummary,
  monthToRange,
  normalizeMonth,
  shiftMonth,
  type ManagerSummaryResult,
  type ProductAgg,
} from "@/lib/reports/manager-summary";

export const dynamic = "force-dynamic";
export const metadata = { title: "Звіт менеджера | L-TEX" };

const VIEW_ROLES = [
  "manager",
  "senior_manager",
  "supervisor",
  "analyst",
  "admin",
  "owner",
] as const;
const PLAN_ROLES = new Set<string>(["admin", "owner", "analyst"]);

type ReportView = "clients" | "products";

function currentMonth(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

const uah = new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 0 });
const eur = new Intl.NumberFormat("uk-UA", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const kg = new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 1 });
const int = new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 0 });

function pct(fact: number, plan: number): string {
  if (!plan) return "—";
  return `${Math.round((fact / plan) * 100)}%`;
}

function delta(
  cur: number,
  prev: number,
  fmt: (n: number) => string = int.format.bind(int),
): { text: string; up: boolean } {
  const d = cur - prev;
  return { text: `${d > 0 ? "+" : ""}${fmt(d)}`, up: d >= 0 };
}

export default async function ManagerReportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireRole([...VIEW_ROLES]);
  if (!user) notFound();

  const sp = await searchParams;
  const month =
    normalizeMonth(typeof sp.month === "string" ? sp.month : "") ??
    currentMonth();
  const compareRaw = typeof sp.compare === "string" ? sp.compare : "prev";
  const compareMonth =
    compareRaw === "year"
      ? shiftMonth(month, -12)
      : (normalizeMonth(compareRaw) ?? shiftMonth(month, -1));
  const view: ReportView = sp.view === "products" ? "products" : "clients";

  const { from, to } = monthToRange(month);
  const { from: prevFrom, to: prevTo } = monthToRange(compareMonth);

  // Скоуп: менеджер бачить лише своїх клієнтів; admin/owner/аналітик — усіх.
  const scope = await getMyClientCodes1C(user);

  const data = await getManagerSummary({
    from,
    to,
    prevFrom,
    prevTo,
    scope,
    planMonth: month,
  });

  const canSetPlan = PLAN_ROLES.has(user.role);
  const qs = (v: ReportView) =>
    `?view=${v}&month=${month}&compare=${compareRaw === "year" ? "year" : "prev"}`;

  return (
    <div className="max-w-none space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Звіт менеджера</h1>
          <p className="mt-1 text-sm text-gray-600">
            Період: {month} · порівняння з {compareMonth}
            {scope !== null ? " · лише ваші клієнти" : " · усі клієнти"}
          </p>
        </div>
        {canSetPlan && (
          <Link
            href={`/manager/reports/plans?month=${month}`}
            className="inline-flex h-9 items-center rounded-md border border-gray-300 px-3 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Задати план
          </Link>
        )}
      </header>

      {/* Перемикач Клієнти / Товари */}
      <div className="inline-flex rounded-md border border-gray-300 p-0.5 text-sm">
        <Link
          href={qs("clients")}
          className={`rounded px-4 py-1.5 font-medium ${
            view === "clients"
              ? "bg-green-600 text-white"
              : "text-gray-600 hover:bg-gray-50"
          }`}
        >
          Клієнти
        </Link>
        <Link
          href={qs("products")}
          className={`rounded px-4 py-1.5 font-medium ${
            view === "products"
              ? "bg-green-600 text-white"
              : "text-gray-600 hover:bg-gray-50"
          }`}
        >
          Товари
        </Link>
      </div>

      {/* Панель періоду (GET-форма) */}
      <form
        method="get"
        className="flex flex-wrap items-end gap-3 rounded-md border border-gray-200 bg-white p-3"
      >
        <input type="hidden" name="view" value={view} />
        <label className="text-sm">
          <span className="mb-1 block text-gray-600">Місяць</span>
          <input
            type="month"
            name="month"
            defaultValue={month}
            className="h-10 rounded-md border border-gray-300 px-3 text-sm"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-gray-600">Порівняти з</span>
          <select
            name="compare"
            defaultValue={compareRaw === "year" ? "year" : "prev"}
            className="h-10 rounded-md border border-gray-300 px-3 text-sm"
          >
            <option value="prev">Попередній місяць</option>
            <option value="year">Той самий місяць торік</option>
          </select>
        </label>
        <button
          type="submit"
          className="h-10 rounded-md bg-green-600 px-4 text-sm font-medium text-white hover:bg-green-700"
        >
          Сформувати
        </button>
      </form>

      <KpiRow data={data} view={view} />
      <GroupsBlock data={data} />
      {view === "clients" ? (
        <>
          <RegionsTable data={data} />
          <ClientsTable data={data} />
          <ChurnBlock data={data} />
        </>
      ) : (
        <>
          <ProductsTable data={data} />
          <ProductChurn data={data} />
        </>
      )}
    </div>
  );
}

// ─── KPI ─────────────────────────────────────────────────────────────────────

function KpiRow({
  data,
  view,
}: {
  data: ManagerSummaryResult;
  view: ReportView;
}) {
  const c = data.current;
  const p = data.previous;
  const revenue = (
    <Kpi
      title="Виручка"
      main={`${eur.format(c.revenueEur)} €`}
      sub={`${uah.format(c.revenueUah)} ₴`}
      delta={delta(c.revenueEur, p.revenueEur, eur.format.bind(eur))}
    />
  );
  const tonnage = (
    <Kpi
      title="Тонаж"
      main={`${kg.format(c.weightKg)} кг`}
      sub={`${kg.format(c.weightKg / 1000)} т`}
      delta={delta(c.weightKg, p.weightKg, kg.format.bind(kg))}
    />
  );
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {revenue}
      {tonnage}
      {view === "clients" ? (
        <>
          <Kpi
            title="ТТ скупились"
            main={String(c.ttCount)}
            sub={`було ${p.ttCount}`}
            delta={delta(c.ttCount, p.ttCount)}
          />
          <Kpi
            title="Нові ТТ"
            main={String(c.newTtCount)}
            sub={`було ${p.newTtCount}`}
            delta={delta(c.newTtCount, p.newTtCount)}
          />
        </>
      ) : (
        <>
          <Kpi
            title="Товарів (SKU)"
            main={String(data.currentProducts.length)}
            sub={`було ${data.previousProducts.length}`}
            delta={delta(
              data.currentProducts.length,
              data.previousProducts.length,
            )}
          />
          <Kpi
            title="Одиниць продано"
            main={int.format(sumQty(data.currentProducts))}
            sub={`було ${int.format(sumQty(data.previousProducts))}`}
            delta={delta(
              sumQty(data.currentProducts),
              sumQty(data.previousProducts),
            )}
          />
        </>
      )}
    </div>
  );
}

function sumQty(products: ProductAgg[]): number {
  return products.reduce((n, p) => n + p.qty, 0);
}

function Kpi({
  title,
  main,
  sub,
  delta,
}: {
  title: string;
  main: string;
  sub: string;
  delta: { text: string; up: boolean };
}) {
  return (
    <div className="rounded-md border border-gray-200 bg-white p-3">
      <div className="text-xs text-gray-500">{title}</div>
      <div className="mt-1 text-lg font-bold text-gray-800">{main}</div>
      <div className="mt-0.5 flex items-center justify-between text-xs">
        <span className="text-gray-500">{sub}</span>
        <span className={delta.up ? "text-green-600" : "text-red-600"}>
          {delta.text}
        </span>
      </div>
    </div>
  );
}

// ─── Групи Сток / Секонд ─────────────────────────────────────────────────────

function GroupsBlock({ data }: { data: ManagerSummaryResult }) {
  const g = data.current.groups;
  const totalEur =
    g.stock.revenueEur + g.second.revenueEur + g.other.revenueEur;
  const order: ProductGroup[] = ["stock", "second", "other"];
  return (
    <section className="rounded-md border border-gray-200 bg-white p-3">
      <h2 className="mb-2 text-sm font-semibold text-gray-700">
        Розбивка по групах товару
      </h2>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-sm">
          <thead className="text-left text-gray-500">
            <tr>
              <th className="py-1 font-medium">Група</th>
              <th className="py-1 text-right font-medium">Виручка, €</th>
              <th className="py-1 text-right font-medium">Тонаж, кг</th>
              <th className="py-1 text-right font-medium">Частка виручки</th>
            </tr>
          </thead>
          <tbody>
            {order.map((k) => (
              <tr key={k} className="border-t border-gray-100">
                <td className="py-1.5">{PRODUCT_GROUP_LABEL[k]}</td>
                <td className="py-1.5 text-right">
                  {eur.format(g[k].revenueEur)}
                </td>
                <td className="py-1.5 text-right">
                  {kg.format(g[k].weightKg)}
                </td>
                <td className="py-1.5 text-right">
                  {totalEur
                    ? `${Math.round((g[k].revenueEur / totalEur) * 100)}%`
                    : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ─── Клікабельне ім'я клієнта ────────────────────────────────────────────────

function ClientName({ id, name }: { id: string | null; name: string }) {
  if (!id) return <span>{name}</span>;
  return (
    <Link
      href={`/manager/customers/${id}`}
      className="text-green-700 hover:underline"
    >
      {name}
    </Link>
  );
}

// ─── По областях (з планом, у €) ─────────────────────────────────────────────

function RegionsTable({ data }: { data: ManagerSummaryResult }) {
  const totalPlan = data.totalPlan;
  const c = data.current;
  return (
    <section className="rounded-md border border-gray-200 bg-white p-3">
      <h2 className="mb-2 text-sm font-semibold text-gray-700">
        По областях (факт vs план)
      </h2>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="text-left text-gray-500">
            <tr>
              <th className="py-1 font-medium">Область</th>
              <th className="py-1 text-right font-medium">Виручка, €</th>
              <th className="py-1 text-right font-medium">Тонаж, кг</th>
              <th className="py-1 text-right font-medium">ТТ</th>
              <th className="py-1 text-right font-medium">Нові ТТ</th>
              <th className="py-1 text-right font-medium">План €</th>
              <th className="py-1 text-right font-medium">Викон.</th>
              <th className="py-1 text-right font-medium">План ТТ</th>
              <th className="py-1 text-right font-medium">План нові</th>
            </tr>
          </thead>
          <tbody>
            {data.regions.map((r) => (
              <tr
                key={r.regionSlug ?? "none"}
                className="border-t border-gray-100"
              >
                <td className="py-1.5">{r.regionLabel}</td>
                <td className="py-1.5 text-right">
                  {eur.format(r.revenueEur)}
                </td>
                <td className="py-1.5 text-right">{kg.format(r.weightKg)}</td>
                <td className="py-1.5 text-right">{r.ttCount}</td>
                <td className="py-1.5 text-right">{r.newTtCount}</td>
                <td className="py-1.5 text-right text-gray-500">
                  {r.plan ? eur.format(r.plan.planRevenueEur) : "—"}
                </td>
                <td className="py-1.5 text-right">
                  {r.plan ? pct(r.revenueEur, r.plan.planRevenueEur) : "—"}
                </td>
                <td className="py-1.5 text-right text-gray-500">
                  {r.plan ? r.plan.planTtCount : "—"}
                </td>
                <td className="py-1.5 text-right text-gray-500">
                  {r.plan ? r.plan.planNewTtCount : "—"}
                </td>
              </tr>
            ))}
            <tr className="border-t-2 border-gray-300 bg-amber-50 font-medium">
              <td className="py-1.5">Разом</td>
              <td className="py-1.5 text-right">{eur.format(c.revenueEur)}</td>
              <td className="py-1.5 text-right">{kg.format(c.weightKg)}</td>
              <td className="py-1.5 text-right">{c.ttCount}</td>
              <td className="py-1.5 text-right">{c.newTtCount}</td>
              <td className="py-1.5 text-right text-gray-600">
                {totalPlan ? eur.format(totalPlan.planRevenueEur) : "—"}
              </td>
              <td className="py-1.5 text-right">
                {totalPlan ? pct(c.revenueEur, totalPlan.planRevenueEur) : "—"}
              </td>
              <td className="py-1.5 text-right text-gray-600">
                {totalPlan ? totalPlan.planTtCount : "—"}
              </td>
              <td className="py-1.5 text-right text-gray-600">
                {totalPlan ? totalPlan.planNewTtCount : "—"}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ─── По клієнтах ─────────────────────────────────────────────────────────────

function ClientsTable({ data }: { data: ManagerSummaryResult }) {
  const clients = data.current.byClient;
  return (
    <section className="rounded-md border border-gray-200 bg-white p-3">
      <h2 className="mb-2 text-sm font-semibold text-gray-700">
        По клієнтах (ТТ){" "}
        {clients.length >= data.clientLimitApplied && (
          <span className="text-xs font-normal text-gray-400">
            — показано перші {data.clientLimitApplied}
          </span>
        )}
      </h2>
      {clients.length === 0 ? (
        <p className="text-sm text-gray-500">Продажів за період немає.</p>
      ) : (
        <div className="max-h-[28rem] overflow-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="sticky top-0 bg-white text-left text-gray-500">
              <tr>
                <th className="py-1 font-medium">Клієнт (ТТ)</th>
                <th className="py-1 font-medium">Область</th>
                <th className="py-1 text-right font-medium">Виручка, €</th>
                <th className="py-1 text-right font-medium">₴</th>
                <th className="py-1 text-right font-medium">Тонаж, кг</th>
                <th className="py-1 text-center font-medium">Новий</th>
              </tr>
            </thead>
            <tbody>
              {clients.map((c) => (
                <tr key={c.customerId} className="border-t border-gray-100">
                  <td className="py-1.5">
                    <ClientName id={c.mgrClientId} name={c.customerName} />
                  </td>
                  <td className="py-1.5 text-gray-600">{c.regionLabel}</td>
                  <td className="py-1.5 text-right">
                    {eur.format(c.revenueEur)}
                  </td>
                  <td className="py-1.5 text-right text-gray-500">
                    {uah.format(c.revenueUah)}
                  </td>
                  <td className="py-1.5 text-right">{kg.format(c.weightKg)}</td>
                  <td className="py-1.5 text-center">{c.isNew ? "✅" : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// ─── Спрацювання ТТ (порівняння) ─────────────────────────────────────────────

function ChurnBlock({ data }: { data: ManagerSummaryResult }) {
  const cmp = data.comparison;
  return (
    <section className="rounded-md border border-gray-200 bg-white p-3">
      <h2 className="mb-2 text-sm font-semibold text-gray-700">
        Спрацювання ТТ (відносно порівняльного періоду)
      </h2>
      <div className="mb-3 flex flex-wrap gap-4 text-sm">
        <span className="text-green-700">Нові: {cmp.gainedCount}</span>
        <span className="text-red-600">Вилетіли: {cmp.lostCount}</span>
        <span className="text-gray-600">Стабільні: {cmp.stableCount}</span>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <ChurnList
          title="Нові ТТ (зʼявились цього періоду)"
          rows={cmp.gained}
          empty="Нових ТТ немає"
        />
        <ChurnList
          title="Втрачені ТТ (вилетіли)"
          rows={cmp.lost}
          empty="Втрачених ТТ немає"
        />
      </div>
    </section>
  );
}

function ChurnList({
  title,
  rows,
  empty,
}: {
  title: string;
  rows: {
    customerId: string;
    mgrClientId: string | null;
    customerName: string;
    regionLabel: string;
    revenueEur: number;
  }[];
  empty: string;
}) {
  return (
    <div>
      <div className="mb-1 text-xs font-medium text-gray-500">{title}</div>
      {rows.length === 0 ? (
        <p className="text-sm text-gray-400">{empty}</p>
      ) : (
        <ul className="max-h-64 space-y-0.5 overflow-auto text-sm">
          {rows.map((r) => (
            <li
              key={r.customerId}
              className="flex justify-between gap-2 border-b border-gray-50 py-1"
            >
              <span>
                <ClientName id={r.mgrClientId} name={r.customerName} />{" "}
                <span className="text-gray-400">· {r.regionLabel}</span>
              </span>
              <span className="text-gray-500">
                {eur.format(r.revenueEur)} €
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── По товарах ──────────────────────────────────────────────────────────────

function ProductsTable({ data }: { data: ManagerSummaryResult }) {
  const products = data.currentProducts;
  return (
    <section className="rounded-md border border-gray-200 bg-white p-3">
      <h2 className="mb-2 text-sm font-semibold text-gray-700">
        По товарах{" "}
        {products.length >= data.clientLimitApplied && (
          <span className="text-xs font-normal text-gray-400">
            — показано перші {data.clientLimitApplied}
          </span>
        )}
      </h2>
      {products.length === 0 ? (
        <p className="text-sm text-gray-500">Продажів за період немає.</p>
      ) : (
        <div className="max-h-[32rem] overflow-auto">
          <table className="w-full min-w-[680px] text-sm">
            <thead className="sticky top-0 bg-white text-left text-gray-500">
              <tr>
                <th className="py-1 font-medium">Товар</th>
                <th className="py-1 font-medium">Артикул</th>
                <th className="py-1 font-medium">Група</th>
                <th className="py-1 text-right font-medium">Виручка, €</th>
                <th className="py-1 text-right font-medium">Тонаж, кг</th>
                <th className="py-1 text-right font-medium">К-сть</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.productId} className="border-t border-gray-100">
                  <td className="py-1.5">{p.productName}</td>
                  <td className="py-1.5 text-gray-500">
                    {p.articleCode ?? "—"}
                  </td>
                  <td className="py-1.5 text-gray-600">
                    {PRODUCT_GROUP_LABEL[p.group]}
                  </td>
                  <td className="py-1.5 text-right">
                    {eur.format(p.revenueEur)}
                  </td>
                  <td className="py-1.5 text-right">{kg.format(p.weightKg)}</td>
                  <td className="py-1.5 text-right">{int.format(p.qty)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// ─── Спрацювання товарів (порівняння) ────────────────────────────────────────

function ProductChurn({ data }: { data: ManagerSummaryResult }) {
  const curIds = new Set(data.currentProducts.map((p) => p.productId));
  const prevIds = new Set(data.previousProducts.map((p) => p.productId));
  const started = data.currentProducts.filter((p) => !prevIds.has(p.productId));
  const stopped = data.previousProducts.filter((p) => !curIds.has(p.productId));
  return (
    <section className="rounded-md border border-gray-200 bg-white p-3">
      <h2 className="mb-2 text-sm font-semibold text-gray-700">
        Зміни в асортименті (відносно порівняльного періоду)
      </h2>
      <div className="mb-3 flex flex-wrap gap-4 text-sm">
        <span className="text-green-700">
          Почали продавати: {started.length}
        </span>
        <span className="text-red-600">Перестали: {stopped.length}</span>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <ProductChurnList
          title="Нові в продажах"
          rows={started}
          empty="Немає нових товарів"
        />
        <ProductChurnList
          title="Зникли з продажів"
          rows={stopped}
          empty="Нічого не зникло"
        />
      </div>
    </section>
  );
}

function ProductChurnList({
  title,
  rows,
  empty,
}: {
  title: string;
  rows: ProductAgg[];
  empty: string;
}) {
  return (
    <div>
      <div className="mb-1 text-xs font-medium text-gray-500">{title}</div>
      {rows.length === 0 ? (
        <p className="text-sm text-gray-400">{empty}</p>
      ) : (
        <ul className="max-h-64 space-y-0.5 overflow-auto text-sm">
          {rows.map((p) => (
            <li
              key={p.productId}
              className="flex justify-between gap-2 border-b border-gray-50 py-1"
            >
              <span>
                {p.productName}{" "}
                <span className="text-gray-400">
                  · {PRODUCT_GROUP_LABEL[p.group]}
                </span>
              </span>
              <span className="text-gray-500">
                {eur.format(p.revenueEur)} €
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
