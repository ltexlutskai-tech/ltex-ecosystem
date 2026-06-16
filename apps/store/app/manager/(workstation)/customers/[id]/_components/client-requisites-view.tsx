import { formatPhoneUkr, phoneToViberUrl } from "@ltex/shared";
import { ClientStatusBadge } from "../../_components/client-status-badge";
import { formatEur, parseDecimal } from "../../_components/format";
import { ClientActionButtons } from "./client-action-buttons";
import { ClientBankAccountRow } from "./client-bank-account-row";
import { ClientPhonesSection } from "./client-phones-section";
import { ClientRoutesSection } from "./client-routes-section";
import {
  ClientAddressLink,
  ClientWebsiteLink,
  GeolocationLink,
  NovaPoshtaBranchLink,
} from "./client-address-link";
import type { ClientDetail } from "./types";

function fmtDate(iso: string | Date | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("uk-UA");
}

function fmtDateTime(iso: string | Date | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("uk-UA");
}

function fmtMoney(value: string | null | undefined): string {
  if (value == null || value === "") return "—";
  return formatEur(value);
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
        {formatEur(value)}
      </span>
    );
  }
  return (
    <span
      className={
        n > 0 ? "text-red-700" : n < 0 ? "text-green-700" : "text-gray-700"
      }
    >
      {formatEur(value)}
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

interface ViewProps {
  client: ClientDetail;
  canEdit: boolean;
  onEditClick?: () => void;
  editDisabledReason?: string;
  isForeign?: boolean;
  /** `Customer.id` (дзеркало по code1C) для prefill Замовлення/Реалізації. */
  customerId?: string | null;
}

export function ClientRequisitesView({
  client,
  canEdit,
  onEditClick,
  editDisabledReason,
  isForeign,
  customerId,
}: ViewProps) {
  // Основний (видимий) розрахунковий рахунок — перший рядок без isHidden.
  const primaryBankAccount =
    client.bankAccounts.find((b) => !b.isHidden) ?? null;

  return (
    <div className="space-y-6">
      <ClientPhonesSection
        clientId={client.id}
        phones={client.phones}
        phonePrimary={client.phonePrimary}
        isForeign={isForeign}
        canEdit={canEdit}
      />

      <section className="rounded-lg border bg-white p-5 shadow-sm">
        <div className="mb-3 flex items-center justify-end">
          <button
            type="button"
            onClick={canEdit && onEditClick ? onEditClick : undefined}
            disabled={!canEdit}
            title={!canEdit ? editDisabledReason : undefined}
            className="rounded-md border border-gray-300 bg-white px-3 py-1 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-400"
          >
            Редагувати
          </button>
        </div>
        <dl className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
          <Row label="Код" value={client.code1C ?? "—"} />
          <Row label="Створений" value={fmtDate(client.createdAt)} />
          <Row
            label="Найменування"
            value={<span className="break-words">{client.name}</span>}
          />
          <Row label="Торгова точка" value={client.tradePointName ?? "—"} />

          <Row label="Повна назва" value={client.fullName ?? "—"} />
          <Row label="Тип особи" value={client.legalType ?? "—"} />

          <Row
            label="Email"
            value={
              client.email ? (
                <a
                  href={`mailto:${client.email}`}
                  className="text-blue-600 hover:underline"
                >
                  {client.email}
                </a>
              ) : (
                "—"
              )
            }
          />
          <Row label="Графік роботи" value={client.workingHours ?? "—"} />

          <Row label="ІНН" value={client.inn ?? "—"} />
          <Row label="ЄДРПОУ" value={client.edrpou ?? "—"} />

          <Row label="Код голови-клієнта" value={client.parentCode1C ?? "—"} />

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

          <Row
            label="Канал пошуку"
            value={client.searchChannel?.label ?? "—"}
          />
          <Row
            label="Контакт Viber"
            value={<ViberContactValue contact={client.viberContact} />}
          />

          <Row label="Торговий агент" value={client.agent?.fullName ?? "—"} />
          <Row
            label="Залишок сесії"
            value={fmtMoney(client.sessionRemainder)}
          />

          <Row
            label="Днів з останньої покупки"
            value={client.daysSinceLastPurchase ?? "—"}
          />
          <Row label="Остання покупка" value={fmtDate(client.lastPurchaseAt)} />

          <Row
            label="Ліцензія дійсна до"
            value={fmtDate(client.licenseExpiresAt)}
          />
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

          <div className="sm:col-span-2">
            <Row
              label="Розрахунковий рахунок"
              value={
                primaryBankAccount ? (
                  <ClientBankAccountRow account={primaryBankAccount} />
                ) : (
                  <span className="text-gray-400">—</span>
                )
              }
            />
          </div>

          <div className="sm:col-span-2">
            <Row
              label="Коментар"
              value={
                client.comment ? (
                  <span className="whitespace-pre-wrap">{client.comment}</span>
                ) : (
                  "—"
                )
              }
            />
          </div>

          <div className="sm:col-span-2">
            <Row
              label="Додатковий опис"
              value={
                client.additionalDescription ? (
                  <span className="whitespace-pre-wrap">
                    {client.additionalDescription}
                  </span>
                ) : (
                  "—"
                )
              }
            />
          </div>
        </dl>
      </section>

      <ClientRoutesSection
        clientId={client.id}
        routes={client.routes}
        primaryRouteId={client.primaryRoute?.id ?? null}
        isForeign={isForeign}
        canEdit={canEdit}
      />

      <FlagsBlock client={client} />

      <ClientActionButtons clientId={client.id} customerId={customerId} />
    </div>
  );
}
