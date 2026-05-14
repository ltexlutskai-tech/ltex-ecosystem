// Builders for messenger / social-network deep links.
//
// Source 1С: TabularSection.СоцМережі on `Catalog.Контрагенты`.
// Кожен запис має поля: Мережа (network code), Посилання (handle), ПосиланняВБраузері (browser URL override),
// Коментар (free text). Тут — pure URL builders + emoji-icon fallback per network.

export type SocialNetwork =
  | "tiktok"
  | "instagram"
  | "facebook"
  | "telegram"
  | "viber"
  | "youtube"
  | "whatsapp"
  | "other";

/**
 * Будує clickable URL для social-network handle.
 * Якщо є `browserUrl` (з 1С `ПосиланняВБраузері`) — використовуємо його напряму, ігноруючи handle.
 * Повертає `null` якщо нема ані handle, ані browserUrl, або network невідома.
 */
export function buildSocialUrl(
  network: string,
  handle: string | null | undefined,
  browserUrl?: string | null | undefined,
): string | null {
  if (browserUrl && browserUrl.trim()) return browserUrl.trim();
  if (!handle || !handle.trim()) return null;
  const clean = handle.replace(/^@/, "").trim();
  switch (network.toLowerCase()) {
    case "tiktok":
      return `https://www.tiktok.com/@${clean}`;
    case "instagram":
      return `https://www.instagram.com/${clean}`;
    case "facebook":
      if (clean.startsWith("http://") || clean.startsWith("https://"))
        return clean;
      return `https://www.facebook.com/${clean}`;
    case "telegram":
      return `https://t.me/${clean}`;
    case "viber": {
      const phone = clean.replace(/[\s+()-]/g, "");
      return `viber://chat?number=%2B${phone}`;
    }
    case "youtube":
      if (clean.startsWith("http://") || clean.startsWith("https://"))
        return clean;
      return `https://www.youtube.com/@${clean}`;
    case "whatsapp": {
      const phone = clean.replace(/[\s+()-]/g, "");
      return `https://wa.me/${phone}`;
    }
    default:
      return null;
  }
}

/**
 * Emoji-icon fallback для display (replace з proper SVG коли є time).
 */
export function socialNetworkIcon(network: string): string {
  switch (network.toLowerCase()) {
    case "tiktok":
      return "🎵";
    case "instagram":
      return "📷";
    case "facebook":
      return "📘";
    case "telegram":
      return "✈️";
    case "viber":
      return "💬";
    case "youtube":
      return "🎥";
    case "whatsapp":
      return "✉️";
    default:
      return "🔗";
  }
}

/**
 * Human-readable label per network.
 */
export function socialNetworkLabel(network: string): string {
  switch (network.toLowerCase()) {
    case "tiktok":
      return "TikTok";
    case "instagram":
      return "Instagram";
    case "facebook":
      return "Facebook";
    case "telegram":
      return "Telegram";
    case "viber":
      return "Viber";
    case "youtube":
      return "YouTube";
    case "whatsapp":
      return "WhatsApp";
    default:
      return network;
  }
}
