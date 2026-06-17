import { redirect } from "next/navigation";
import { prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import {
  buildDebtWhere,
  mapDebtMovementToRow,
} from "@/lib/manager/debt-register-view";
import { ListPagination } from "../../customers/_components/list-pagination";
import { DebtRegisterFilters } from "./_components/debt-register-filters";
import { DebtRegisterTable } from "./_components/debt-register-table";

export const dynamic = "force-dynamic";
export const metadata = { title: "Регістр: Борг (рухи)" };

const PAGE_SIZE = 50;

const ALLOWED = [
  "admin",
  "owner",
  "analyst",
  "supervisor",
  "bookkeeper",
  "manager",
] as const;

export default async function DebtRegisterPage({
  searchParams,
}: {
  searchParams: Promise<{
    from?: string;
    to?: string;
    clientId?: string;
    q?: string;
    kind?: string;
    page?: string;
  }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/manager/login");
  if (!(ALLOWED as readonly string[]).includes(user.role)) {
    redirect("/manager");
  }

  const sp = await searchParams;
  const where = buildDebtWhere(sp);
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);

  const [total, aggregate, movements] = await Promise.all([
    prisma.mgrDebtMovement.count({ where }),
    prisma.mgrDebtMovement.aggregate({ where, _sum: { amountEur: true } }),
    prisma.mgrDebtMovement.findMany({
      where,
      orderBy: { occurredAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        clientId: true,
        occurredAt: true,
        amountEur: true,
        kind: true,
        sourceType: true,
        note: true,
        client: { select: { id: true, name: true } },
      },
    }),
  ]);

  const rows = movements.map(mapDebtMovementToRow);
  const totalAmount = aggregate._sum.amountEur
    ? Number(aggregate._sum.amountEur)
    : 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">
          Регістр: Борг (рухи)
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Глобальний журнал рухів взаєморозрахунків по всіх клієнтах.
        </p>
      </div>

      <DebtRegisterFilters
        initial={{
          from: sp.from ?? "",
          to: sp.to ?? "",
          q: sp.q ?? "",
          kind: sp.kind ?? "",
        }}
      />

      <DebtRegisterTable rows={rows} total={total} totalAmount={totalAmount} />

      <ListPagination page={page} totalPages={totalPages} />
    </div>
  );
}
