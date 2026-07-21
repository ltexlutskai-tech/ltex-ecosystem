import { redirect } from "next/navigation";
import { prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { formatDocNumber } from "@/lib/manager/order-number";
import { AutoRefresh } from "../_components/auto-refresh";
import {
  NpCheckClient,
  type NpCheckRow,
  type NpCheckSummary,
} from "./_components/novapay-check-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Звірка NovaPay — L-TEX Manager" };

const OFFICE_ROLES = ["bookkeeper", "admin", "owner"];

/** Початок доби у локальному поданні (без урахування таймзони — достатньо для звірки). */
function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

/** Парсить ISO-дату (YYYY-MM-DD) → Date або null, якщо некоректна. */
function parseIsoDate(v: string | undefined): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** YYYY-MM-DD для value інпутів дати. */
function toIsoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export default async function NovapayCheckPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/manager/login");

  if (!OFFICE_ROLES.includes(user.role)) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8">
        <p className="text-sm text-gray-600">Недостатньо прав.</p>
      </div>
    );
  }

  const sp = await searchParams;
  const today = new Date();
  const parsedFrom = parseIsoDate(sp.from);
  const parsedTo = parseIsoDate(sp.to);

  // Дефолт — останні 7 днів (сьогодні − 6 … сьогодні, включно).
  const defaultFrom = new Date(today);
  defaultFrom.setDate(defaultFrom.getDate() - 6);

  const from = startOfDay(parsedFrom ?? defaultFrom);
  const to = endOfDay(parsedTo ?? today);

  const orders = await prisma.mgrCashOrder.findMany({
    where: {
      source: "novapay_auto",
      type: "income",
      createdAt: { gte: from, lte: to },
    },
    orderBy: { createdAt: "desc" },
    take: 500,
    select: {
      id: true,
      amountUah: true,
      amountUahCashless: true,
      documentSumEur: true,
      verifiedAt: true,
      verifiedByName: true,
      createdAt: true,
      sale: {
        select: {
          id: true,
          number1C: true,
          code1C: true,
          docNumber: true,
          expressWaybill: true,
          customer: { select: { name: true } },
        },
      },
    },
  });

  const rows: NpCheckRow[] = orders.map((o) => {
    const amountUah = o.amountUahCashless || o.amountUah || 0;
    return {
      id: o.id,
      createdAt: o.createdAt.toISOString(),
      saleId: o.sale?.id ?? null,
      saleNumber: o.sale ? formatDocNumber(o.sale) : "—",
      customerName: o.sale?.customer?.name ?? null,
      ttn: o.sale?.expressWaybill ?? null,
      amountUah,
      verified: Boolean(o.verifiedAt),
      verifiedByName: o.verifiedByName ?? null,
    };
  });

  const verifiedCount = rows.filter((r) => r.verified).length;
  const totalUah = rows.reduce((s, r) => s + r.amountUah, 0);
  const summary: NpCheckSummary = {
    total: rows.length,
    verified: verifiedCount,
    unverified: rows.length - verifiedCount,
    totalUah,
  };

  return (
    <>
      <NpCheckClient
        rows={rows}
        summary={summary}
        from={toIsoDay(from)}
        to={toIsoDay(to)}
      />
      <AutoRefresh intervalMs={30_000} />
    </>
  );
}
