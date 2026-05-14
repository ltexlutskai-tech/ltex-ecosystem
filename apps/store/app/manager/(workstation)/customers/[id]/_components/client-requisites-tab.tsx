import { formatPhoneUkr, phoneToViberUrl } from "@ltex/shared";
import { ClientStatusBadge } from "../../_components/client-status-badge";
import { formatUah, parseDecimal } from "../../_components/format";
import { ClientActionButtons } from "./client-action-buttons";
import { ClientContactRow } from "./client-contact-row";
import {
  ClientAddressLink,
  ClientWebsiteLink,
  GeolocationLink,
  NovaPoshtaBranchLink,
} from "./client-address-link";
import type { ClientDetail } from "./types";

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("uk-UA");
}

function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("uk-UA");
}

function fmtMoney(value: string | null | undefined): string {
  if (value == null || value === "") return "—";
  return formatUah(value);
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 text-sm">
      <dt className="w-44 shrink-0 text-gray-500">{label}:</dt>
      <dd className="min-w-0 flex-1 font-medium text-gray-800">{value}</dd>
    </div>
  );
}

function DebtValue({
  value,
  muted = false,
}: {
  value: string | null;
  muted?: boolean;
}) {
  const n = parseDecimal(value);
  if (value == null || value === "")
    return <span className="text-gray-400">—</span>;
  if (muted) {
    return (
      <span className={n > 0 ? "text-orange-700" : "text-gray-700"}>
        {formatUah(value)}
      </span>
    );
  }
  return (
    <span
      className={
        n > 0 ? "text-red-700" : n < 0 ? "text-green-700" : "text-gray-700"
      }
    >
      {formatUah(value)}
    </span>
  );
}

function ViberContactValue({ contact }: { contact: string | null }) {
  if (!contact) return <span className="text-gray-400">—</span>;
  const url = phoneToViberUrl(contact);
  const formatted = formatPhoneUkr(contact);
  if (!url) return <span>{contact}</span>;
  return (
    <a href={url} className="text-purple-700 hover:underline">
      💬 {formatted}
    </a>
  );
}

function PhonesBlock({
  phones,
  viberContact,
}: {
  phones: {
    id: string;
    phone: string;
    label: string | null;
    messenger: string | null;
  }[];
  viberContact: string | null;
}) {
  if (phones.length === 0 && !viberContact) return null;
  return (
    <div className="rounded-lg border bg-white p-5 shadow-sm">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700">
          Номери телефонів
        </h3>
        <span
          title="Додавання нових телефонів — через 1С (sync у M1.5)"
          className="cursor-not-allowed rounded border bg-gray-50 px-2 py-1 text-xs text-gray-400"
        >
          + Додати
        </span>
      </div>
      <div className="divide-y divide-gray-100">
        {phones.map((p) => (
          <ClientContactRow
            key={p.id}
            phone={p.phone}
            label={p.label}
            messenger={p.messenger}
          />
        ))}
      </div>
    </div>
  );
}

function RoutesBlock({
  routes,
  primaryRouteId,
}: {
  routes: ClientDetail["routes"];
  primaryRouteId: string | null;
}) {
  if (routes.length === 0) return null;
  return (
    <div className="rounded-lg border bg-white p-5 shadow-sm">
      <h3 className="mb-2 text-sm font-semibold text-gray-700">Маршрути</h3>
      <ul className="space-y-1 text-sm">
        {routes.map((r) => (
          <li key={r.id} className="flex items-center gap-2">
            <span
              className={
                r.isActive ? "text-gray-800" : "text-gray-400 line-through"
              }
            >
              {r.name}
            </span>
            {primaryRouteId === r.routeId && (
              <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] uppercase text-blue-700">
                основний
              </span>
            )}
            {!r.isActive && (
              <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500">
                неактивний
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function FlagsBlock({ client }: { client: ClientDetail }) {
  const flags: { label: string; on: boolean; cls: string }[] = [
    {
      label: "Нове повідомлення",
      on: client.hasNewMessage,
      cls: "bg-amber-50 text-amber-700 border-amber-200",
    },
    {
      label: "Підписаний у Viber",
      on: client.isViberLinked,
      cls: "bg-purple-50 text-purple-700 border-purple-200",
    },
  ];
  const visible = flags.filter((f) => f.on);
  if (visible.length === 0 && !client.dialogStatus) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {visible.map((f) => (
        <span
          key={f.label}
          className={`rounded-full border px-2 py-0.5 text-xs ${f.cls}`}
        >
          {f.label}
        </span>
      ))}
      {client.dialogStatus && (
        <span className="rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs text-gray-700">
          Діалог: {client.dialogStatus}
        </span>
      )}
    </div>
  );
}

export function ClientRequisitesTab({ client }: { client: ClientDetail }) {
  const phonesList = client.phonePrimary
    ? [
        {
          id: "__primary",
          phone: client.phonePrimary,
          label: "основний",
          messenger: null,
        },
        ...client.phones,
      ]
    : client.phones;

  return (
    <div className="space-y-6">
      <PhonesBlock phones={phonesList} viberContact={client.viberContact} />

      <dl className="grid grid-cols-1 gap-x-8 gap-y-3 rounded-lg border bg-white p-5 shadow-sm sm:grid-cols-2">
        <Row label="Код" value={client.code1C ?? "—"} />
        <Row label="Створений" value={fmtDate(client.createdAt)} />
        <Row
          label="Найменування"
          value={<span className="break-words">{client.name}</span>}
        />
        <Row label="Торгова точка" value={client.tradePointName ?? "—"} />

        <Row label="Борг" value={<DebtValue value={client.debt} />} />
        <Row
          label="Протерміновано"
          value={<DebtValue value={client.overdueDebt} muted />}
        />

        <Row label="Борг ТОВ" value={<DebtValue value={client.tovDebt} />} />
        <Row
          label="Просрочено ТОВ"
          value={<DebtValue value={client.tovOverdueDebt} muted />}
        />

        <Row
          label="Статус"
          value={<ClientStatusBadge status={client.statusGeneral} />}
        />
        <Row
          label="Оперативний статус"
          value={<ClientStatusBadge status={client.statusOperational} />}
        />

        <Row label="Тип цін" value={client.priceType?.label ?? "—"} />
        <Row
          label="Асортимент"
          value={client.primaryAssortment?.label ?? "—"}
        />

        <Row
          label="Спосіб доставки"
          value={client.deliveryMethod?.label ?? "—"}
        />
        <Row label="Категорія ТТ" value={client.categoryTT?.label ?? "—"} />

        <Row label="Область" value={client.region ?? "—"} />
        <Row label="Місто" value={client.city ?? "—"} />
        <Row label="Вулиця" value={client.street ?? "—"} />
        <Row label="Будинок" value={client.house ?? "—"} />

        <Row
          label="Відділення НП"
          value={
            <NovaPoshtaBranchLink
              branch={client.novaPoshtaBranch}
              city={client.city}
            />
          }
        />
        <Row
          label="Сайт"
          value={<ClientWebsiteLink url={client.websiteUrl} />}
        />

        <Row
          label="Геолокація"
          value={<GeolocationLink geo={client.geolocation} />}
        />
        <Row
          label="Обсяг за місяць"
          value={client.monthlyVolume ? `${client.monthlyVolume} кг` : "—"}
        />

        <Row label="Канал пошуку" value={client.searchChannel?.label ?? "—"} />
        <Row
          label="Контакт Viber"
          value={<ViberContactValue contact={client.viberContact} />}
        />

        <Row label="Торговий агент" value={client.agent?.fullName ?? "—"} />
        <Row label="Залишок сесії" value={fmtMoney(client.sessionRemainder)} />

        <Row label="Дата створення" value={fmtDate(client.createdAt)} />
        <Row label="Оновлено з 1С" value={fmtDateTime(client.lastSyncedAt)} />

        <div className="sm:col-span-2">
          <Row
            label="Адреса"
            value={
              <ClientAddressLink
                region={client.region}
                city={client.city}
                street={client.street}
                house={client.house}
              />
            }
          />
        </div>
      </dl>

      <RoutesBlock
        routes={client.routes}
        primaryRouteId={client.primaryRoute?.id ?? null}
      />

      <FlagsBlock client={client} />

      <ClientActionButtons clientId={client.id} />
    </div>
  );
}
