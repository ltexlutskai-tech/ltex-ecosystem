import type { ChatPlatform } from "@ltex/db";

/**
 * Абстракція над send-API кожної платформи (Telegram, Viber, ...).
 *
 * `externalUserId` — ID користувача у платформі (Telegram chat.id як string;
 * Viber sender.id). `text` — plain text (HTML/markdown лишаємо платформі;
 * Telegram у webhook handler-ах вже використовує parse_mode=HTML, тут — ні,
 * бо вхідне menager-y повідомлення не санітизуємо).
 *
 * Повертає опційно `externalMessageId` (Telegram повертає `message_id` у
 * відповіді sendMessage; Viber повертає `message_token`). Якщо платформенний
 * виклик впав / токена нема — повертаємо без externalMessageId (НЕ кидаємо).
 */
export interface PlatformSender {
  send(
    externalUserId: string,
    text: string,
  ): Promise<{ externalMessageId?: string }>;
}

const TELEGRAM_API = "https://api.telegram.org";
const VIBER_SEND_URL = "https://chatapi.viber.com/pa/send_message";

interface TelegramSendResponse {
  ok: boolean;
  result?: { message_id?: number };
  description?: string;
}

interface ViberSendResponse {
  status: number;
  status_message?: string;
  message_token?: number | string;
}

/**
 * Telegram bot sender (`sendMessage` API).
 *
 * Якщо `TELEGRAM_BOT_TOKEN` відсутній — mock-mode: console.warn + fake id.
 * Це збігається з нашим патерном для manager-sync (mock-mode для тестів).
 */
export const telegramSender: PlatformSender = {
  async send(externalUserId, text) {
    const token = process.env.TELEGRAM_BOT_TOKEN ?? "";
    if (!token) {
      console.warn(
        "[L-TEX] Telegram sender mock-mode: TELEGRAM_BOT_TOKEN not set",
      );
      return { externalMessageId: `mock-tg-${Date.now()}` };
    }
    try {
      const res = await fetch(`${TELEGRAM_API}/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: externalUserId,
          text,
          disable_web_page_preview: true,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as TelegramSendResponse;
      if (!res.ok || !data.ok) {
        console.warn("[L-TEX] Telegram send failed", {
          status: res.status,
          description: data.description,
        });
        return {};
      }
      const id = data.result?.message_id;
      return id != null ? { externalMessageId: String(id) } : {};
    } catch (error) {
      console.warn("[L-TEX] Telegram send error", {
        error: error instanceof Error ? error.message : String(error),
      });
      return {};
    }
  },
};

/**
 * Viber bot sender (`/pa/send_message` API).
 *
 * Якщо `VIBER_AUTH_TOKEN` відсутній — mock-mode.
 */
export const viberSender: PlatformSender = {
  async send(externalUserId, text) {
    const token = process.env.VIBER_AUTH_TOKEN ?? "";
    if (!token) {
      console.warn("[L-TEX] Viber sender mock-mode: VIBER_AUTH_TOKEN not set");
      return { externalMessageId: `mock-viber-${Date.now()}` };
    }
    try {
      const res = await fetch(VIBER_SEND_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Viber-Auth-Token": token,
        },
        body: JSON.stringify({
          receiver: externalUserId,
          type: "text",
          sender: { name: "L-TEX" },
          text,
          min_api_version: 7,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as ViberSendResponse;
      if (!res.ok || data.status !== 0) {
        console.warn("[L-TEX] Viber send failed", {
          status: res.status,
          viberStatus: data.status,
          message: data.status_message,
        });
        return {};
      }
      const token2 = data.message_token;
      return token2 != null ? { externalMessageId: String(token2) } : {};
    } catch (error) {
      console.warn("[L-TEX] Viber send error", {
        error: error instanceof Error ? error.message : String(error),
      });
      return {};
    }
  },
};

const mockSender: PlatformSender = {
  async send(_externalUserId, _text) {
    return { externalMessageId: `mock-unknown-${Date.now()}` };
  },
};

/**
 * Фабрика — повертає sender за платформою. WhatsApp / Instagram / Facebook /
 * TikTok поки mock-mode (вихідний API ще не інтегровано — див.
 * `CHAT_PLATFORMS[…].outbound` у `lib/chat/platforms.ts`). Exhaustive-`never`
 * гарантує: додав платформу в enum → мусиш вирішити її sender тут.
 */
export function getPlatformSender(platform: ChatPlatform): PlatformSender {
  switch (platform) {
    case "telegram":
      return telegramSender;
    case "viber":
      return viberSender;
    case "whatsapp":
    case "instagram":
    case "facebook":
    case "tiktok":
      return mockSender;
    default: {
      const exhaustive: never = platform;
      void exhaustive;
      return mockSender;
    }
  }
}
