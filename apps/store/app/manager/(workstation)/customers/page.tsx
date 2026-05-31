import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import {
  type ConfigItem,
  getAllKeysFor,
  getDefaultsFor,
  mergePrefs,
} from "@/lib/manager/view-defaults";
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

  const [dictionaries, list, columnsPrefs, filtersPrefs] = await Promise.all([
    loadDictionariesSnapshot(),
    loadClients({
      userId: user.id,
      userRole: user.role,
      search: pickString(sp.search),
      // legacy single — backward compat
      status: pickString(sp.status),
      channel: pickString(sp.channel),
      deliveryMethod: pickString(sp.deliveryMethod),
      // M1.3e multi-select
      statusIds: pickCsv(sp.statusId),
      statusOperationalIds: pickCsv(sp.statusOperationalId),
      channelIds: pickCsv(sp.channelId),
      deliveryMethodIds: pickCsv(sp.deliveryMethodId),
      categoryTTIds: pickCsv(sp.categoryTTId),
      priceTypeIds: pickCsv(sp.priceTypeId),
      primaryAssortmentIds: pickCsv(sp.primaryAssortmentId),
      primaryRouteIds: pickCsv(sp.primaryRouteId),
      agentUserIds: pickCsv(sp.agentUserId),
      // text
      region: pickString(sp.region),
      city: pickString(sp.city),
      dialogStatus: pickString(sp.dialogStatus),
      // numeric ranges
      debtMin: pickNumber(sp.debtMin),
      debtMax: pickNumber(sp.debtMax),
      overdueDebtMin: pickNumber(sp.overdueDebtMin),
      overdueDebtMax: pickNumber(sp.overdueDebtMax),
      monthlyVolumeMin: pickNumber(sp.monthlyVolumeMin),
      monthlyVolumeMax: pickNumber(sp.monthlyVolumeMax),
      daysSinceMin: pickInt(sp.daysSinceMin),
      daysSinceMax: pickInt(sp.daysSinceMax),
      // dates
      licenseExpiresBefore: pickDate(sp.licenseExpiresBefore),
      createdFrom: pickDate(sp.createdFrom),
      createdTo: pickDate(sp.createdTo),
      // bool
      hasNewMessage: pickBool(sp.hasNewMessage),
      isViberLinked: pickBool(sp.isViberLinked),
      hasDebt: pickBool(sp.hasDebt),
      hasOverpayment: pickBool(sp.hasOverpayment),
      onlyMine: pickBool(sp.onlyMine),
      page,
      pageSize,
      hideTrash: pickBool(sp.hideTrash) ?? true,
    }),
    loadViewPrefs(user.id, "clients_table"),
    loadViewPrefs(user.id, "clients_filters"),
  ]);

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Клієнти</h1>
          <p className="mt-1 text-sm text-gray-600">
            Усього: {list.total} · сторінка {list.page} з {list.totalPages}
          </p>
        </div>
        <Link
          href="/manager/customers/new"
          className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
        >
          + Створити клієнта
        </Link>
      </header>
      <ClientListToolbar
        dictionaries={dictionaries}
        filtersPrefs={filtersPrefs}
        columnsPrefs={columnsPrefs}
        totalCount={list.total}
        showOnlyMineToggle={user.role === "admin"}
      />
      <ClientListTable items={list.items} columnsPrefs={columnsPrefs} />
      <ListPagination page={list.page} totalPages={list.totalPages} />
    </div>
  );
}

async function loadViewPrefs(
  userId: string,
  viewKey: "clients_table" | "clients_filters",
): Promise<ConfigItem[]> {
  const row = await prisma.mgrUserViewPrefs
    .findUnique({
      where: { userId_viewKey: { userId, viewKey } },
    })
    .catch(() => null);
  const saved =
    row?.config &&
    typeof row.config === "object" &&
    "items" in row.config &&
    Array.isArray((row.config as { items?: unknown }).items)
      ? (row.config as unknown as { items: ConfigItem[] }).items
      : null;
  return mergePrefs(saved, getDefaultsFor(viewKey), getAllKeysFor(viewKey));
}

function pickString(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v && v.length > 0 ? v : undefined;
}

function pickCsv(v: string | string[] | undefined): string[] | undefined {
  const s = pickString(v);
  if (!s) return undefined;
  const arr = s
    .split(",")
    .map((x) => x.trim())
    .filter((x) => x.length > 0);
  return arr.length > 0 ? arr : undefined;
}

function pickBool(v: string | string[] | undefined): boolean | undefined {
  const s = pickString(v);
  if (s === "true") return true;
  if (s === "false") return false;
  return undefined;
}

function pickNumber(v: string | string[] | undefined): number | undefined {
  const s = pickString(v);
  if (!s) return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

function pickInt(v: string | string[] | undefined): number | undefined {
  const s = pickString(v);
  if (!s) return undefined;
  const n = Number.parseInt(s, 10);
  return Number.isFinite(n) ? n : undefined;
}

function pickDate(v: string | string[] | undefined): Date | undefined {
  const s = pickString(v);
  if (!s) return undefined;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? undefined : d;
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
