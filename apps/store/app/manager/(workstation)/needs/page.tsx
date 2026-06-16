import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { computeNeeds, type NeedsFilters } from "@/lib/manager/needs";
import { NeedsClient } from "./_components/needs-client";

// Ролі, що можуть заводити замовлення (для кнопки «+ Створити замовлення»).
const CAN_CREATE_ORDER_ROLES = new Set([
  "admin",
  "owner",
  "manager",
  "senior_manager",
  "analyst",
]);

export const dynamic = "force-dynamic";
export const metadata = { title: "Потреби — L-TEX Manager" };

function parseDate(raw: string | undefined): Date | undefined {
  if (!raw) return undefined;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export default async function NeedsPage({
  searchParams,
}: {
  searchParams: Promise<{
    clientId?: string;
    agentUserId?: string;
    city?: string;
    dateFrom?: string;
    dateTo?: string;
    deficitOnly?: string;
  }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/manager/login");

  const sp = await searchParams;
  const deficitOnly = sp.deficitOnly !== "false";
  const filters: NeedsFilters = {
    clientId: sp.clientId?.trim() || undefined,
    agentUserId: sp.agentUserId?.trim() || undefined,
    city: sp.city?.trim() || undefined,
    dateFrom: parseDate(sp.dateFrom),
    dateTo: parseDate(sp.dateTo),
    deficitOnly,
  };

  const data = await computeNeeds(filters, user);
  const canCreateOrder = CAN_CREATE_ORDER_ROLES.has(user.role);

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Потреби</h1>
          <p className="mt-1 text-sm text-gray-500">
            Зведена потреба по актуальних замовленнях. Потрібно = Замовлено −
            Остаток (вільні лоти).
          </p>
        </div>
        {canCreateOrder && (
          <Link
            href="/manager/orders/new"
            className="inline-flex h-10 shrink-0 items-center justify-center rounded-md bg-green-600 px-4 text-sm font-medium text-white hover:bg-green-700"
          >
            <Plus className="mr-1 h-4 w-4" />
            Створити замовлення
          </Link>
        )}
      </div>
      <NeedsClient data={data} deficitOnly={deficitOnly} city={sp.city ?? ""} />
    </div>
  );
}
