import { ClientMessengerLink } from "./client-messenger-link";
import { ClientWebsiteLink } from "./client-address-link";
import type { ClientDetail } from "./types";

export function ClientSocialTab({ client }: { client: ClientDetail }) {
  const hasMessengers = client.messengers.length > 0;
  const hasWebsite = !!client.websiteUrl;

  if (!hasMessengers && !hasWebsite) {
    return (
      <div className="rounded-lg border bg-white p-5 text-sm text-gray-500 shadow-sm">
        Соцмереж не вказано.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {hasMessengers && (
        <div className="rounded-lg border bg-white p-5 shadow-sm">
          <h3 className="mb-3 text-sm font-semibold text-gray-700">
            Соцмережі
          </h3>
          <div className="flex flex-wrap gap-2">
            {client.messengers.map((m) => (
              <ClientMessengerLink key={m.id} messenger={m} />
            ))}
          </div>
          {client.messengers.some((m) => m.comment) && (
            <ul className="mt-3 space-y-1 text-xs text-gray-500">
              {client.messengers
                .filter((m) => m.comment)
                .map((m) => (
                  <li key={`c-${m.id}`}>
                    <span className="font-medium">{m.network}</span>:{" "}
                    {m.comment}
                  </li>
                ))}
            </ul>
          )}
        </div>
      )}

      {hasWebsite && (
        <div className="rounded-lg border bg-white p-5 shadow-sm">
          <h3 className="mb-2 text-sm font-semibold text-gray-700">
            Сайт клієнта
          </h3>
          <ClientWebsiteLink url={client.websiteUrl} />
        </div>
      )}
    </div>
  );
}
