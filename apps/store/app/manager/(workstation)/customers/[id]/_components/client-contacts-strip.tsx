import { Phone } from "lucide-react";
import {
  buildSocialUrl,
  formatPhoneUkr,
  phoneToTelUrl,
  phoneToViberUrl,
  phoneToWhatsAppUrl,
  socialNetworkLabel,
} from "@ltex/shared";
import {
  BrandIcon,
  resolveBrandIconKind,
} from "../../../_components/brand-icons";
import type { ClientDetail } from "./types";

const ICON_BTN =
  "flex h-8 w-8 items-center justify-center rounded-md border bg-white text-gray-700 shadow-sm hover:bg-gray-50";

/** Малий clickable бренд-icon для телефону (Viber/WhatsApp/дзвінок). */
function PhoneIcon({
  phone,
  messenger,
  label,
}: {
  phone: string;
  messenger: string | null;
  label: string | null;
}) {
  const telUrl = phoneToTelUrl(phone);
  const pretty = formatPhoneUkr(phone);
  const title = label ? `${pretty} (${label})` : pretty;

  if (messenger === "viber") {
    const url = phoneToViberUrl(phone);
    if (url)
      return (
        <a
          href={url}
          aria-label={`Viber ${pretty}`}
          title={title}
          className={ICON_BTN}
        >
          <BrandIcon kind="viber" className="h-4 w-4" />
        </a>
      );
  }
  if (messenger === "whatsapp") {
    const url = phoneToWhatsAppUrl(phone);
    if (url)
      return (
        <a
          href={url}
          target="_blank"
          rel="noopener"
          aria-label={`WhatsApp ${pretty}`}
          title={title}
          className={ICON_BTN}
        >
          <BrandIcon kind="whatsapp" className="h-4 w-4" />
        </a>
      );
  }
  if (messenger === "telegram") {
    return (
      <span
        className={`${ICON_BTN} cursor-default`}
        aria-label={`Telegram ${pretty}`}
        title={title}
      >
        <BrandIcon kind="telegram" className="h-4 w-4" />
      </span>
    );
  }

  if (telUrl)
    return (
      <a
        href={telUrl}
        aria-label={`Подзвонити ${pretty}`}
        title={title}
        className={ICON_BTN}
      >
        <Phone className="h-3.5 w-3.5" />
      </a>
    );
  return null;
}

/**
 * Блок «Контакти» на шапці картки — дзеркало телефонів +
 * соцмереж/месенджерів клієнта у вигляді малих clickable бренд-іконок.
 *
 * Для foreign view дані вже масковані у `maskClientForForeign`
 * (phones мають messenger=null + masked phone string, messengers=[],
 * websiteUrl=null), тож телефони рендеряться без посилань, а блок
 * найчастіше зовсім порожній → не показуємо.
 */
export function ClientContactsStrip({
  client,
  isForeign = false,
}: {
  client: ClientDetail;
  isForeign?: boolean;
}) {
  // Збираємо телефони: основний + список (без дублів за нормалізованим номером).
  const phoneEntries: {
    key: string;
    phone: string;
    messenger: string | null;
    label: string | null;
  }[] = [];
  const seen = new Set<string>();

  if (client.phonePrimary) {
    seen.add(client.phonePrimary);
    phoneEntries.push({
      key: "primary",
      phone: client.phonePrimary,
      messenger: null,
      label: "основний",
    });
  }
  for (const p of client.phones) {
    if (seen.has(p.phone)) continue;
    seen.add(p.phone);
    phoneEntries.push({
      key: p.id,
      phone: p.phone,
      messenger: p.messenger,
      label: p.label,
    });
  }

  const phoneIcons = isForeign
    ? []
    : phoneEntries
        .map((e) => (
          <PhoneIcon
            key={`p-${e.key}`}
            phone={e.phone}
            messenger={e.messenger}
            label={e.label}
          />
        ))
        .filter(Boolean);

  const messengerIcons = client.messengers
    .map((m) => {
      const url = buildSocialUrl(m.network, m.handle, m.browserUrl ?? m.url);
      if (!url) return null;
      const label = socialNetworkLabel(m.network);
      const handle = (m.handle ?? "").replace(/^@/, "");
      return (
        <a
          key={`m-${m.id}`}
          href={url}
          target={url.startsWith("viber://") ? undefined : "_blank"}
          rel="noopener"
          aria-label={label}
          title={handle ? `${label} · @${handle}` : label}
          className={ICON_BTN}
        >
          <BrandIcon
            kind={resolveBrandIconKind(m.network)}
            className="h-4 w-4"
          />
        </a>
      );
    })
    .filter(Boolean);

  const websiteIcon =
    !isForeign && client.websiteUrl ? (
      <a
        key="website"
        href={client.websiteUrl}
        target="_blank"
        rel="noopener"
        aria-label="Сайт клієнта"
        title={client.websiteUrl}
        className={ICON_BTN}
      >
        <BrandIcon kind="link" className="h-4 w-4" />
      </a>
    ) : null;

  const allIcons = [...phoneIcons, ...messengerIcons];
  if (websiteIcon) allIcons.push(websiteIcon);

  if (allIcons.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 pt-1">
      <span className="text-xs font-medium uppercase tracking-wide text-gray-500">
        Контакти
      </span>
      {allIcons}
    </div>
  );
}
