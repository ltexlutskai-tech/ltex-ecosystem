import Link from "next/link";
import type { ReactNode } from "react";
import { ClientStatusBadge } from "../_components/client-status-badge";
import { DebtCell } from "../_components/debt-cell";
import { DaysSinceCell } from "../_components/days-since-cell";
import { formatEur } from "../_components/format";
import type { ClientListItem } from "../_components/types";

// Per-key cell renderer. Працює з прев'ю даних з loadClients().
// Якщо колонка нема даних — повертаємо "—".

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("uk-UA", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function renderCell(key: string, c: ClientListItem): ReactNode {
  switch (key) {
    case "name":
      return (
        <Link
          href={`/manager/customers/${c.id}`}
          className="block text-gray-900 hover:text-blue-600"
        >
          <div className="font-medium">{c.name}</div>
          {(c.region || c.city) && (
            <div className="text-xs text-gray-500">
              {[c.region, c.city].filter(Boolean).join(" · ")}
            </div>
          )}
        </Link>
      );
    case "tradePointName":
      return c.tradePointName ?? "—";
    case "code1C":
      return c.code1C ?? "—";
    case "phonePrimary":
      return c.phonePrimary ?? "—";
    case "statusGeneral":
      return <ClientStatusBadge status={c.statusGeneral} />;
    case "statusOperational":
      return <ClientStatusBadge status={c.statusOperational} />;
    case "searchChannel":
      return c.searchChannel?.label ?? "—";
    case "deliveryMethod":
      return c.deliveryMethod?.label ?? "—";
    case "categoryTT":
      return c.categoryTT?.label ?? "—";
    case "priceType":
      return c.priceType?.label ?? "—";
    case "primaryAssortment":
      return c.primaryAssortment?.label ?? "—";
    case "primaryRoute":
      return c.primaryRoute?.label ?? "—";
    case "agent":
      return (
        c.agent?.fullName ??
        c.assignedManager?.fullName ?? (
          <span className="text-xs text-gray-400">не призначено</span>
        )
      );
    case "region":
      return c.region ?? "—";
    case "city":
      return c.city ?? "—";
    case "debt":
      return <DebtCell value={c.debt} />;
    case "overdueDebt":
      return formatEur(c.overdueDebt);
    case "monthlyVolume":
      return c.monthlyVolume ? `${c.monthlyVolume} кг` : "—";
    case "daysSinceLast":
      return <DaysSinceCell days={c.daysSinceLastPurchase} />;
    case "lastSyncedAt":
      return formatDate(c.lastSyncedAt);
    case "createdAt":
      return formatDate(c.createdAt);
    default:
      return "—";
  }
}
