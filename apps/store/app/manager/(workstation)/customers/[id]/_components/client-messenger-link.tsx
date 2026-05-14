import {
  buildSocialUrl,
  socialNetworkIcon,
  socialNetworkLabel,
} from "@ltex/shared";
import type { ClientMessenger } from "./types";

/**
 * Clickable chip per social-network / messenger.
 */
export function ClientMessengerLink({
  messenger,
}: {
  messenger: ClientMessenger;
}) {
  const url = buildSocialUrl(
    messenger.network,
    messenger.handle,
    messenger.browserUrl,
  );
  const icon = socialNetworkIcon(messenger.network);
  const label = socialNetworkLabel(messenger.network);
  const handle = messenger.handle.replace(/^@/, "");

  const inner = (
    <>
      <span aria-hidden>{icon}</span>
      <span className="font-medium">{label}</span>
      <span className="text-gray-500">·</span>
      <span className="text-gray-700">@{handle}</span>
    </>
  );

  const baseCls =
    "inline-flex items-center gap-1.5 rounded-full border bg-white px-3 py-1 text-xs text-gray-700 shadow-sm";

  if (url) {
    return (
      <a
        href={url}
        target={url.startsWith("viber://") ? undefined : "_blank"}
        rel="noopener"
        className={`${baseCls} hover:border-blue-300 hover:bg-blue-50`}
        title={messenger.comment ?? undefined}
      >
        {inner}
      </a>
    );
  }
  return (
    <span
      className={`${baseCls} cursor-not-allowed opacity-60`}
      title={messenger.comment ?? "Лінк не вдалося сформувати"}
    >
      {inner}
    </span>
  );
}
