import Link from "next/link";
import { Building2, Network } from "lucide-react";
import type { ClientHierarchyRef } from "./types";

interface Props {
  parentClient: ClientHierarchyRef | null;
  childClients: ClientHierarchyRef[];
}

/**
 * ТЗ 8.0 — Блок E1: дерево «головний клієнт → філії».
 * Read-only. Нічого не рендерить, якщо клієнт не є ані філією, ані мережею.
 */
export function ClientHierarchySection({ parentClient, childClients }: Props) {
  if (!parentClient && childClients.length === 0) return null;

  return (
    <div className="rounded-lg border bg-white p-5 shadow-sm">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-700">
        <Network className="h-4 w-4 text-gray-400" /> Мережа клієнтів
      </h3>

      {parentClient && (
        <div className="mb-3 flex items-start gap-2 text-sm">
          <span className="w-32 shrink-0 text-gray-500">Головний клієнт:</span>
          <Link
            href={`/manager/customers/${parentClient.id}`}
            className="flex items-center gap-1.5 font-medium text-blue-600 hover:underline"
          >
            <Building2 className="h-3.5 w-3.5" />
            {parentClient.name}
          </Link>
        </div>
      )}

      {childClients.length > 0 && (
        <div className="flex items-start gap-2 text-sm">
          <span className="w-32 shrink-0 text-gray-500">
            Філії ({childClients.length}):
          </span>
          <ul className="min-w-0 flex-1 space-y-1">
            {childClients.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/manager/customers/${c.id}`}
                  className="font-medium text-blue-600 hover:underline"
                >
                  {c.name}
                </Link>
                {c.code1C && (
                  <span className="ml-1.5 text-xs text-gray-400">
                    ({c.code1C})
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
