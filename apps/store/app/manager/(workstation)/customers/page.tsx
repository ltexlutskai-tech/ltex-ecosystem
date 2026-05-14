import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { ClientListTable } from "./_components/client-list-table";
import { ClientListToolbar } from "./_components/client-list-toolbar";
import { ListPagination } from "./_components/list-pagination";
import { loadClients, loadDictionariesSnapshot } from "./_lib/load-clients";

export const dynamic = "force-dynamic";
export const metadata = { title: "Клієнти — L-TEX Manager" };

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/manager/login");

  const sp = await searchParams;
  const page = clampInt(sp.page, 1, 1, 9_999);
  const pageSize = clampInt(sp.pageSize, 50, 10, 100);

  const [dictionaries, list] = await Promise.all([
    loadDictionariesSnapshot(),
    loadClients({
      userId: user.id,
      search: pickString(sp.search),
      status: pickString(sp.status),
      channel: pickString(sp.channel),
      deliveryMethod: pickString(sp.deliveryMethod),
      hasDebt: pickBool(sp.hasDebt),
      hasOverpayment: pickBool(sp.hasOverpayment),
      onlyMine: pickBool(sp.onlyMine),
      page,
      pageSize,
      hideTrash: true,
    }),
  ]);

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Клієнти</h1>
          <p className="mt-1 text-sm text-gray-600">
            Усього: {list.total} · сторінка {list.page} з {list.totalPages}
          </p>
        </div>
      </header>
      <ClientListToolbar
        statuses={dictionaries.statuses}
        channels={dictionaries.channels}
        deliveries={dictionaries.deliveries}
      />
      <ClientListTable items={list.items} />
      <ListPagination page={list.page} totalPages={list.totalPages} />
    </div>
  );
}

function pickString(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v && v.length > 0 ? v : undefined;
}

function pickBool(v: string | string[] | undefined): boolean | undefined {
  const s = pickString(v);
  if (s === "true") return true;
  if (s === "false") return false;
  return undefined;
}

function clampInt(
  v: string | string[] | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  const s = pickString(v);
  const n = s ? Number(s) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(Math.floor(n), min), max);
}
