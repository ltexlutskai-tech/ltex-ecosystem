import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { computeNeeds, type NeedsFilters } from "@/lib/manager/needs";
import { NeedsClient } from "./_components/needs-client";

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

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Потреби</h1>
        <p className="mt-1 text-sm text-gray-500">
          Зведена потреба по актуальних замовленнях. Потрібно = Замовлено −
          Остаток (вільні лоти).
        </p>
      </div>
      <NeedsClient data={data} deficitOnly={deficitOnly} city={sp.city ?? ""} />
    </div>
  );
}
