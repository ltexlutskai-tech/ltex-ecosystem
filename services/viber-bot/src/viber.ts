/**
 * Viber REST API client.
 * Docs: https://developers.viber.com/docs/api/rest-bot-api/
 *
 * No external dependencies — uses native fetch.
 */

const AUTH_TOKEN = process.env.VIBER_AUTH_TOKEN ?? "";
const API_BASE = "https://chatapi.viber.com/pa";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ViberWebhookEvent {
  event: string;
  timestamp: number;
  chat_hostname?: string;
  message_token?: number;
  sender?: ViberUser;
  message?: ViberMessage;
  user?: ViberUser;
  // callback data
  type?: string;
}

export interface ViberUser {
  id: string;
  name: string;
  avatar?: string;
  language?: string;
  country?: string;
  api_version?: number;
}

export interface ViberMessage {
  type: string;
  text?: string;
  media?: string;
  tracking_data?: string;
}

export interface ViberKeyboard {
  Type: "keyboard";
  DefaultHeight?: boolean;
  BgColor?: string;
  Buttons: ViberButton[];
}

export interface ViberButton {
  Columns?: number;
  Rows?: number;
  Text?: string;
  TextSize?: "small" | "regular" | "large";
  TextHAlign?: "left" | "center" | "right";
  TextVAlign?: "top" | "middle" | "bottom";
  ActionType?: "reply" | "open-url" | "none";
  ActionBody: string;
  BgColor?: string;
  Image?: string;
  Silent?: boolean;
}

export interface ViberRichMedia {
  Type: "rich_media";
  ButtonsGroupColumns: number;
  ButtonsGroupRows: number;
  BgColor?: string;
  Buttons: ViberButton[];
}

// ─── API Methods ─────────────────────────────────────────────────────────────

async function apiCall(
  method: string,
  body: Record<string, unknown>,
): Promise<unknown> {
  const res = await fetch(`${API_BASE}/${method}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Viber-Auth-Token": AUTH_TOKEN,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (data.status !== 0) {
    console.error(`Viber API error [${method}]:`, data.status_message);
  }
  return data;
}

export async function sendTextMessage(
  receiverId: string,
  text: string,
  keyboard?: ViberKeyboard,
  trackingData?: string,
): Promise<void> {
  await apiCall("send_message", {
    receiver: receiverId,
    type: "text",
    text,
    keyboard,
    tracking_data: trackingData,
    min_api_version: 7,
  });
}

export async function sendRichMedia(
  receiverId: string,
  richMedia: ViberRichMedia,
  altText?: string,
  keyboard?: ViberKeyboard,
): Promise<void> {
  await apiCall("send_message", {
    receiver: receiverId,
    type: "rich_media",
    rich_media: richMedia,
    alt_text: altText ?? "",
    keyboard,
    min_api_version: 7,
  });
}

export async function sendUrlMessage(
  receiverId: string,
  url: string,
  keyboard?: ViberKeyboard,
): Promise<void> {
  await apiCall("send_message", {
    receiver: receiverId,
    type: "url",
    media: url,
    keyboard,
    min_api_version: 7,
  });
}

export async function setWebhook(
  url: string,
  eventTypes?: string[],
): Promise<void> {
  await apiCall("set_webhook", {
    url,
    event_types: eventTypes ?? [
      "delivered",
      "seen",
      "failed",
      "subscribed",
      "unsubscribed",
      "conversation_started",
    ],
    send_name: true,
    send_photo: false,
  });
  console.log(`Viber webhook set to: ${url}`);
}

export async function removeWebhook(): Promise<void> {
  await apiCall("set_webhook", { url: "" });
  console.log("Viber webhook removed");
}

export async function getAccountInfo(): Promise<unknown> {
  return apiCall("get_account_info", {});
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Build a main menu keyboard with common actions */
export function mainMenuKeyboard(): ViberKeyboard {
  return {
    Type: "keyboard",
    DefaultHeight: false,
    BgColor: "#f5f5f5",
    Buttons: [
      {
        Columns: 3,
        Rows: 1,
        Text: '<font color="#fff"><b>🔍 Пошук</b></font>',
        ActionType: "reply",
        ActionBody: "menu:search",
        BgColor: "#16a34a",
        TextSize: "regular",
        TextHAlign: "center",
        TextVAlign: "middle",
      },
      {
        Columns: 3,
        Rows: 1,
        Text: '<font color="#fff"><b>📦 Лоти</b></font>',
        ActionType: "reply",
        ActionBody: "menu:lots",
        BgColor: "#2563eb",
        TextSize: "regular",
        TextHAlign: "center",
        TextVAlign: "middle",
      },
      {
        Columns: 3,
        Rows: 1,
        Text: '<font color="#fff"><b>📂 Категорії</b></font>',
        ActionType: "reply",
        ActionBody: "menu:categories",
        BgColor: "#7c3aed",
        TextSize: "regular",
        TextHAlign: "center",
        TextVAlign: "middle",
      },
      {
        Columns: 3,
        Rows: 1,
        Text: '<font color="#fff"><b>📋 Замовлення</b></font>',
        ActionType: "reply",
        ActionBody: "menu:order",
        BgColor: "#d97706",
        TextSize: "regular",
        TextHAlign: "center",
        TextVAlign: "middle",
      },
      {
        Columns: 3,
        Rows: 1,
        Text: '<font color="#fff"><b>💰 Ціни</b></font>',
        ActionType: "reply",
        ActionBody: "menu:prices",
        BgColor: "#0284c7",
        TextSize: "regular",
        TextHAlign: "center",
        TextVAlign: "middle",
      },
      {
        Columns: 3,
        Rows: 1,
        Text: '<font color="#fff"><b>🆕 Новинки</b></font>',
        ActionType: "reply",
        ActionBody: "menu:new",
        BgColor: "#dc2626",
        TextSize: "regular",
        TextHAlign: "center",
        TextVAlign: "middle",
      },
      {
        Columns: 3,
        Rows: 1,
        Text: '<font color="#16a34a"><b>🛍 Каталог</b></font>',
        ActionType: "open-url",
        ActionBody:
          (process.env.NEXT_PUBLIC_SITE_URL ?? "https://ltex.com.ua") +
          "/catalog",
        BgColor: "#e8f5e9",
        TextSize: "regular",
        TextHAlign: "center",
        TextVAlign: "middle",
      },
      {
        Columns: 3,
        Rows: 1,
        Text: '<font color="#333"><b>❓ Допомога</b></font>',
        ActionType: "reply",
        ActionBody: "menu:help",
        BgColor: "#e5e7eb",
        TextSize: "regular",
        TextHAlign: "center",
        TextVAlign: "middle",
      },
    ],
  };
}

/** Build quality filter buttons for lots */
export function qualityKeyboard(): ViberKeyboard {
  const labels: Record<string, string> = {
    extra: "Екстра",
    cream: "Крем",
    first: "1й сорт",
    second: "2й сорт",
    stock: "Сток",
    mix: "Мікс",
  };

  return {
    Type: "keyboard",
    DefaultHeight: false,
    BgColor: "#f5f5f5",
    Buttons: [
      ...Object.entries(labels).map(([key, label]) => ({
        Columns: 2,
        Rows: 1,
        Text: `<font color="#333"><b>${label}</b></font>`,
        ActionType: "reply" as const,
        ActionBody: `lots:${key}`,
        BgColor: "#e5e7eb",
        TextSize: "regular" as const,
        TextHAlign: "center" as const,
        TextVAlign: "middle" as const,
      })),
      {
        Columns: 6,
        Rows: 1,
        Text: '<font color="#999">↩️ Головне меню</font>',
        ActionType: "reply" as const,
        ActionBody: "menu:main",
        BgColor: "#f5f5f5",
        TextSize: "small" as const,
        TextHAlign: "center" as const,
        TextVAlign: "middle" as const,
      },
    ],
  };
}
