import { MessageSquare } from "lucide-react";
import { formatPhoneUkr, phoneToViberUrl } from "@ltex/shared";
import type { ClientDetail } from "./types";

interface DeepLink {
  url: string;
  label: string;
}

function collectViberLinks(client: ClientDetail): DeepLink[] {
  const seen = new Set<string>();
  const links: DeepLink[] = [];

  function add(phone: string | null, prefix: string) {
    if (!phone) return;
    const url = phoneToViberUrl(phone);
    if (!url || seen.has(url)) return;
    seen.add(url);
    links.push({ url, label: `${prefix} ${formatPhoneUkr(phone)}` });
  }

  add(client.viberContact, "Viber-контакт");
  add(client.phonePrimary, "Основний");
  for (const p of client.phones) add(p.phone, p.label ?? "Додатковий");
  return links;
}

export function ClientViberTab({ client }: { client: ClientDetail }) {
  const links = collectViberLinks(client);

  return (
    <div className="rounded-lg border bg-white p-6 shadow-sm">
      <h3 className="text-lg font-semibold text-gray-900">Viber-чат</h3>
      <p className="mt-2 text-sm text-gray-600">
        Інтеграцію Viber-бота (читання + відповіді з картки, історія переписки у
        Timeline) зробимо у M1.8. Зараз доступні зовнішні переходи у Viber:
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        {links.length === 0 ? (
          <p className="text-sm text-gray-500">Контактів для Viber нема.</p>
        ) : (
          links.map((l) => (
            <a
              key={l.url}
              href={l.url}
              className="inline-flex items-center gap-2 rounded-md border border-purple-200 bg-purple-50 px-3 py-2 text-sm text-purple-800 hover:bg-purple-100"
            >
              <MessageSquare className="h-4 w-4" />
              {l.label}
            </a>
          ))
        )}
      </div>
      {client.isViberLinked && (
        <p className="mt-3 text-xs text-gray-500">
          ✓ Цей клієнт підписаний у Viber-боті L-TEX.
        </p>
      )}
    </div>
  );
}
