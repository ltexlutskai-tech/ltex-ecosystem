import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/manager-auth";
import { STOCK_DOCS } from "@/lib/manager/stock-documents";

export const dynamic = "force-dynamic";
export const metadata = { title: "Документи руху товару | L-TEX Manager" };

export default async function StockDocumentsHubPage() {
  const user = await requireRole(["manager", "senior_manager", "supervisor", "admin", "owner", "warehouse", "analyst", "bookkeeper", "expeditor"]);
  if (!user) notFound();
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Документи руху товару</h1>
        <p className="mt-1 text-sm text-gray-500">Повернення, перепаковка, списання, оприбуткування, інвентаризація, переміщення між складами (перенесено з 1С).</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {STOCK_DOCS.map((d) => (
          <Link key={d.kind} href={`/manager/stock-documents/${d.slug}`} className="block rounded-md border bg-white p-4 transition hover:border-emerald-400 hover:shadow-sm">
            <div className="font-medium text-gray-900">{d.label}</div>
            <p className="mt-1 text-xs text-gray-500">{d.description}</p>
            <p className="mt-2 text-[11px] text-gray-400">1С: {d.legacyName}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
