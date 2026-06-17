import { redirect } from "next/navigation";
import { prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import {
  buildRatesWhere,
  mapRateToRow,
} from "@/lib/manager/rates-register-view";
import { ListPagination } from "../../customers/_components/list-pagination";
import { RatesRegisterFilters } from "./_components/rates-register-filters";
import { RatesRegisterTable } from "./_components/rates-register-table";

export const dynamic = "force-dynamic";
export const metadata = { title: "Регістр: Курси валют" };

const PAGE_SIZE = 50;

const ALLOWED = [
  "admin",
  "owner",
  "analyst",
  "supervisor",
  "bookkeeper",
  "manager",
] as const;

export default async function RatesRegisterPage({
  searchParams,
}: {
  searchParams: Promise<{
    from?: string;
    to?: string;
    currency?: string;
    page?: string;
  }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/manager/login");
  if (!(ALLOWED as readonly string[]).includes(user.role)) {
    redirect("/manager");
  }

  const sp = await searchParams;
  const where = buildRatesWhere(sp);
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);

  const [total, records] = await Promise.all([
    prisma.exchangeRate.count({ where }),
    prisma.exchangeRate.findMany({
      where,
      orderBy: [{ date: "desc" }, { currencyFrom: "asc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        currencyFrom: true,
        currencyTo: true,
        rate: true,
        date: true,
      },
    }),
  ]);

  const rows = records.map(mapRateToRow);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">
          Регістр: Курси валют
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Історичні курси EUR / USD до гривні по датах (джерело — 1С).
        </p>
      </div>

      <RatesRegisterFilters
        initial={{
          from: sp.from ?? "",
          to: sp.to ?? "",
          currency: sp.currency ?? "",
        }}
      />

      <RatesRegisterTable rows={rows} total={total} />

      <ListPagination page={page} totalPages={totalPages} />
    </div>
  );
}
