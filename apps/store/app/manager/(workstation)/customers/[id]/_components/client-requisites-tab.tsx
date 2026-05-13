import type { ClientDetail } from "./types";
import { ClientActionButtons } from "./client-action-buttons";

export function ClientRequisitesTab({ client }: { client: ClientDetail }) {
  const rows: Array<[string, React.ReactNode]> = [
    ["Категорія ТТ", client.categoryTT?.label ?? "—"],
    ["Канал пошуку", client.searchChannel?.label ?? "—"],
    ["Спосіб доставки", client.deliveryMethod?.label ?? "—"],
    ["Тип асортименту", client.primaryAssortment?.label ?? "—"],
    ["Основний маршрут", client.primaryRoute?.name ?? "—"],
    [
      "Адреса",
      formatAddress(client.region, client.city, client.street, client.house),
    ],
    ["Відділення НП", client.novaPoshtaBranch ?? "—"],
    [
      "Місячний обсяг",
      client.monthlyVolume ? `${client.monthlyVolume} кг` : "—",
    ],
    [
      "Ліцензія дійсна до",
      client.licenseExpiresAt
        ? new Date(client.licenseExpiresAt).toLocaleDateString("uk-UA")
        : "—",
    ],
    ["Дата створення", new Date(client.createdAt).toLocaleDateString("uk-UA")],
    [
      "Останнє оновлення з 1С",
      client.lastSyncedAt
        ? new Date(client.lastSyncedAt).toLocaleString("uk-UA")
        : "—",
    ],
  ];

  return (
    <div className="space-y-6">
      <dl className="grid grid-cols-1 gap-x-8 gap-y-3 rounded-lg border bg-white p-5 shadow-sm sm:grid-cols-2">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-start gap-2 text-sm">
            <dt className="w-44 shrink-0 text-gray-500">{k}:</dt>
            <dd className="font-medium text-gray-800">{v}</dd>
          </div>
        ))}
      </dl>

      {client.phones.length > 0 && (
        <div className="rounded-lg border bg-white p-5 shadow-sm">
          <h3 className="mb-2 text-sm font-semibold text-gray-700">
            Додаткові телефони
          </h3>
          <ul className="space-y-1 text-sm">
            {client.phones.map((p) => (
              <li key={p.id} className="text-gray-700">
                {p.phone}
                {p.label && (
                  <span className="ml-2 text-xs text-gray-500">
                    ({p.label})
                  </span>
                )}
                {p.messenger && (
                  <span className="ml-2 rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600">
                    {p.messenger}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {client.messengers.length > 0 && (
        <div className="rounded-lg border bg-white p-5 shadow-sm">
          <h3 className="mb-2 text-sm font-semibold text-gray-700">
            Соцмережі / месенджери
          </h3>
          <ul className="flex flex-wrap gap-2 text-sm">
            {client.messengers.map((m) => (
              <li
                key={m.id}
                className="rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-700"
              >
                <span className="font-medium">{m.network}</span> — {m.handle}
              </li>
            ))}
          </ul>
        </div>
      )}

      <ClientActionButtons />
    </div>
  );
}

function formatAddress(
  region: string | null,
  city: string | null,
  street: string | null,
  house: string | null,
): string {
  const parts: string[] = [];
  if (region) parts.push(region);
  if (city) parts.push(city);
  const streetPart = [street, house].filter(Boolean).join(", ");
  if (streetPart) parts.push(streetPart);
  return parts.length > 0 ? parts.join(", ") : "—";
}
