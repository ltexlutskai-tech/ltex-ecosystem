import type { ClientRouteRef } from "./types";

export function ClientRoutesTab({
  routes,
  primaryRouteId,
}: {
  routes: ClientRouteRef[];
  primaryRouteId: string | null;
}) {
  if (routes.length === 0) {
    return (
      <div className="rounded-lg border bg-white p-5 text-sm text-gray-500 shadow-sm">
        Клієнт не прив'язаний до жодного маршруту.
      </div>
    );
  }
  return (
    <ul className="divide-y rounded-lg border bg-white shadow-sm">
      {routes.map((r) => (
        <li
          key={r.id}
          className="flex items-center justify-between px-5 py-3 text-sm"
        >
          <span className="font-medium text-gray-800">{r.name}</span>
          <span className="flex items-center gap-2 text-xs">
            {r.routeId === primaryRouteId && (
              <span className="rounded bg-blue-50 px-2 py-0.5 text-blue-700">
                Основний
              </span>
            )}
            {!r.isActive && (
              <span className="rounded bg-gray-100 px-2 py-0.5 text-gray-600">
                Неактивний
              </span>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}
