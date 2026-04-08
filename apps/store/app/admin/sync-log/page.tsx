export const dynamic = "force-dynamic";

import { prisma } from "@ltex/db";
import { Badge } from "@ltex/ui";
import Link from "next/link";

const actionColors: Record<
  string,
  "default" | "secondary" | "accent" | "outline"
> = {
  create: "default",
  update: "accent",
  upsert: "secondary",
  export: "outline",
};

export default async function SyncLogPage({
  searchParams,
}: {
  searchParams: Promise<{ entity?: string; page?: string }>;
}) {
  const params = await searchParams;
  const entity = params.entity;
  const page = parseInt(params.page ?? "1", 10);
  const perPage = 50;

  const where = entity ? { entity } : {};

  const [logs, total, entities] = await Promise.all([
    prisma.syncLog.findMany({
      where,
      orderBy: { syncedAt: "desc" },
      skip: (page - 1) * perPage,
      take: perPage,
    }),
    prisma.syncLog.count({ where }),
    prisma.syncLog.groupBy({
      by: ["entity"],
      _count: { id: true },
    }),
  ]);

  const totalPages = Math.ceil(total / perPage);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Журнал синхронізації</h1>

      <div className="flex flex-wrap gap-2">
        <Link
          href="/admin/sync-log"
          className={`rounded-md border px-3 py-1 text-sm ${!entity ? "bg-green-50 text-green-700 border-green-200" : "hover:bg-gray-50"}`}
        >
          Всі ({total})
        </Link>
        {entities.map((e) => (
          <Link
            key={e.entity}
            href={`/admin/sync-log?entity=${e.entity}`}
            className={`rounded-md border px-3 py-1 text-sm ${entity === e.entity ? "bg-green-50 text-green-700 border-green-200" : "hover:bg-gray-50"}`}
          >
            {e.entity} ({e._count.id})
          </Link>
        ))}
      </div>

      {logs.length === 0 ? (
        <p className="text-sm text-gray-500">Записів не знайдено</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50 text-left text-gray-500">
                <th className="px-4 py-3 font-medium">Дата</th>
                <th className="px-4 py-3 font-medium">Сутність</th>
                <th className="px-4 py-3 font-medium">ID</th>
                <th className="px-4 py-3 font-medium">Дія</th>
                <th className="px-4 py-3 font-medium">Дані</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id} className="border-b hover:bg-gray-50">
                  <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-500">
                    {new Date(log.syncedAt).toLocaleString("uk-UA")}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant="secondary">{log.entity}</Badge>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">
                    {log.entityId ?? "-"}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={actionColors[log.action] ?? "outline"}>
                      {log.action}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    {log.payload ? (
                      <details className="cursor-pointer">
                        <summary className="text-xs text-gray-500 hover:text-gray-700">
                          JSON
                        </summary>
                        <pre className="mt-1 max-h-40 max-w-xs overflow-auto rounded bg-gray-100 p-2 text-xs">
                          {JSON.stringify(log.payload, null, 2)}
                        </pre>
                      </details>
                    ) : (
                      <span className="text-xs text-gray-400">-</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          {Array.from(
            { length: Math.min(totalPages, 10) },
            (_, i) => i + 1,
          ).map((p) => (
            <Link
              key={p}
              href={`/admin/sync-log?${entity ? `entity=${entity}&` : ""}page=${p}`}
              className={`rounded-md border px-3 py-1 text-sm ${p === page ? "bg-green-50 text-green-700 border-green-200" : "hover:bg-gray-50"}`}
            >
              {p}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
