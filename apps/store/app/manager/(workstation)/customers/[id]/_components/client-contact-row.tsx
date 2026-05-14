import { MessageSquare, Phone, Send } from "lucide-react";
import {
  formatPhoneUkr,
  phoneToTelUrl,
  phoneToViberUrl,
  phoneToWhatsAppUrl,
} from "@ltex/shared";

interface Props {
  phone: string;
  label?: string | null;
  messenger?: string | null;
}

/**
 * Один рядок з номером телефону клієнта.
 * 4 actions: tel:, viber://, wa.me, Telegram (disabled — phone-based deeplink не існує).
 */
export function ClientContactRow({ phone, label, messenger }: Props) {
  const formatted = formatPhoneUkr(phone);
  const telUrl = phoneToTelUrl(phone);
  const viberUrl = phoneToViberUrl(phone);
  const whatsAppUrl = phoneToWhatsAppUrl(phone);

  return (
    <div className="flex flex-wrap items-center gap-2 py-1">
      <span className="font-mono text-sm text-gray-800">{formatted}</span>
      {label && <span className="text-xs text-gray-500">({label})</span>}
      {messenger && (
        <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] uppercase text-gray-600">
          {messenger}
        </span>
      )}
      <div className="ml-auto flex items-center gap-1.5">
        {telUrl && (
          <a
            href={telUrl}
            aria-label={`Подзвонити на ${formatted}`}
            title="Подзвонити"
            className="flex h-7 w-7 items-center justify-center rounded-md bg-blue-50 text-blue-700 hover:bg-blue-100"
          >
            <Phone className="h-3.5 w-3.5" />
          </a>
        )}
        {viberUrl && (
          <a
            href={viberUrl}
            aria-label={`Viber: ${formatted}`}
            title="Viber"
            className="flex h-7 w-7 items-center justify-center rounded-md bg-purple-50 text-purple-700 hover:bg-purple-100"
          >
            <MessageSquare className="h-3.5 w-3.5" />
          </a>
        )}
        {whatsAppUrl && (
          <a
            href={whatsAppUrl}
            target="_blank"
            rel="noopener"
            aria-label={`WhatsApp: ${formatted}`}
            title="WhatsApp"
            className="flex h-7 w-7 items-center justify-center rounded-md bg-green-50 text-green-700 hover:bg-green-100"
          >
            <Send className="h-3.5 w-3.5" />
          </a>
        )}
        <span
          aria-disabled="true"
          title="Telegram не має phone-based deeplink — додайте handle у блок «Соц мережі»"
          className="flex h-7 w-7 cursor-not-allowed items-center justify-center rounded-md bg-gray-50 text-gray-300"
        >
          <Send className="h-3.5 w-3.5 -rotate-12" />
        </span>
      </div>
    </div>
  );
}
