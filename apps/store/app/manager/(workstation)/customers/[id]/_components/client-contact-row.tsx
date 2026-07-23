import { Lock, Phone } from "lucide-react";
import {
  formatPhoneUkr,
  phoneToTelUrl,
  phoneToViberUrl,
  phoneToWhatsAppUrl,
} from "@ltex/shared";
import { BrandIcon } from "../../../_components/brand-icons";

interface Props {
  phone: string;
  label?: string | null;
  messenger?: string | null;
  /**
   * Якщо true — `phone` уже є masked-рядком (`*** *** *** 567`); рендеримо
   * як-є, без action-кнопок tel/viber/wa.me/Telegram (контакти приховано
   * для foreign view). M1.3f.
   */
  masked?: boolean;
}

/**
 * Один рядок з номером телефону клієнта.
 * 4 actions: tel:, viber://, wa.me, Telegram (disabled — phone-based deeplink не існує).
 *
 * У foreign view (`masked=true`) рендериться лише masked phone + lock icon,
 * без жодних action-link-ів. Звичайний (mine/admin) view — повний набір.
 */
export function ClientContactRow({ phone, label, messenger, masked }: Props) {
  if (masked) {
    return (
      <div className="flex flex-wrap items-center gap-2 py-1">
        <span className="font-mono text-sm text-gray-500">{phone}</span>
        {label && <span className="text-xs text-gray-500">({label})</span>}
        <Lock
          className="ml-auto h-3.5 w-3.5 text-gray-400"
          aria-label="Контакт приховано"
        />
      </div>
    );
  }

  const formatted = formatPhoneUkr(phone);
  const telUrl = phoneToTelUrl(phone);
  const viberUrl = phoneToViberUrl(phone);
  const whatsAppUrl = phoneToWhatsAppUrl(phone);

  return (
    <div className="flex flex-wrap items-center gap-2 py-1">
      <span className="font-mono text-sm text-gray-800">{formatted}</span>
      {label && <span className="text-xs text-gray-500">({label})</span>}
      {messenger && (
        <BrandIcon
          kind={messenger}
          className="h-4 w-4"
          aria-label={messenger}
        />
      )}
      <div className="ml-auto flex items-center gap-1.5">
        {telUrl && (
          <a
            href={telUrl}
            onClick={(e) => {
              e.preventDefault();
              window.open(telUrl, "_blank", "noopener,noreferrer");
            }}
            aria-label={`Подзвонити на ${formatted}`}
            title="Подзвонити"
            className="flex h-7 w-7 items-center justify-center rounded-md bg-gray-100 text-gray-700 hover:bg-gray-200"
          >
            <Phone className="h-3.5 w-3.5" />
          </a>
        )}
        {viberUrl && (
          <a
            href={viberUrl}
            onClick={(e) => {
              e.preventDefault();
              window.open(viberUrl, "_blank", "noopener,noreferrer");
            }}
            aria-label={`Viber: ${formatted}`}
            title="Viber"
            className="flex h-7 w-7 items-center justify-center rounded-md bg-purple-50 hover:bg-purple-100"
          >
            <BrandIcon kind="viber" className="h-4 w-4" />
          </a>
        )}
        {whatsAppUrl && (
          <a
            href={whatsAppUrl}
            target="_blank"
            rel="noopener"
            aria-label={`WhatsApp: ${formatted}`}
            title="WhatsApp"
            className="flex h-7 w-7 items-center justify-center rounded-md bg-green-50 hover:bg-green-100"
          >
            <BrandIcon kind="whatsapp" className="h-4 w-4" />
          </a>
        )}
      </div>
    </div>
  );
}
