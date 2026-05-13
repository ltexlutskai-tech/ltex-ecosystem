import {
  RevokeAllOthersButton,
  RevokeSessionButton,
} from "./session-row-actions";

export interface SessionItem {
  id: string;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: Date;
  isCurrent: boolean;
}

function parseDevice(ua: string | null): string {
  if (!ua) return "Невідомий пристрій";
  const lower = ua.toLowerCase();
  let device = "Інше";
  if (lower.includes("iphone")) device = "iPhone";
  else if (lower.includes("ipad")) device = "iPad";
  else if (lower.includes("android")) device = "Android";
  else if (lower.includes("windows")) device = "Windows";
  else if (lower.includes("mac os")) device = "macOS";
  else if (lower.includes("linux")) device = "Linux";

  let browser = "";
  if (lower.includes("edg/")) browser = "Edge";
  else if (lower.includes("chrome/")) browser = "Chrome";
  else if (lower.includes("firefox/")) browser = "Firefox";
  else if (lower.includes("safari/")) browser = "Safari";
  return browser ? `${device} · ${browser}` : device;
}

function formatDate(d: Date): string {
  return new Intl.DateTimeFormat("uk-UA", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export function SessionsSection({ sessions }: { sessions: SessionItem[] }) {
  return (
    <section className="rounded-lg border bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-gray-800">Активні сесії</h2>
      <p className="mt-1 text-sm text-gray-500">
        Пристрої, на яких зараз увійдено у ваш обліковий запис.
      </p>
      {sessions.length === 0 ? (
        <p className="mt-4 text-sm text-gray-500">Активних сесій немає.</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b text-left text-xs uppercase text-gray-500">
              <tr>
                <th className="py-2 pr-3">Пристрій</th>
                <th className="py-2 pr-3">IP</th>
                <th className="py-2 pr-3">Активна з</th>
                <th className="py-2 pr-3 text-right">Дії</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => (
                <tr key={s.id} className="border-b last:border-0">
                  <td className="py-2 pr-3 text-gray-800">
                    {parseDevice(s.userAgent)}
                    {s.isCurrent && (
                      <span className="ml-2 rounded bg-green-50 px-2 py-0.5 text-xs text-green-700">
                        поточна
                      </span>
                    )}
                  </td>
                  <td className="py-2 pr-3 text-gray-600">
                    {s.ipAddress ?? "—"}
                  </td>
                  <td className="py-2 pr-3 text-gray-600">
                    {formatDate(s.createdAt)}
                  </td>
                  <td className="py-2 pr-3 text-right">
                    <RevokeSessionButton id={s.id} isCurrent={s.isCurrent} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="mt-4">
        <RevokeAllOthersButton />
      </div>
    </section>
  );
}
