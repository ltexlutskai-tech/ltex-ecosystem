/**
 * Minimal Telegram Bot API client.
 * No external dependencies — uses native fetch.
 */

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? "";
const API_BASE = `https://api.telegram.org/bot${BOT_TOKEN}`;

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: CallbackQuery;
  inline_query?: InlineQuery;
}

export interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  text?: string;
  date: number;
}

export interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
}

export interface TelegramChat {
  id: number;
  type: "private" | "group" | "supergroup" | "channel";
}

export interface CallbackQuery {
  id: string;
  from: TelegramUser;
  message?: TelegramMessage;
  data?: string;
}

export interface InlineQuery {
  id: string;
  from: TelegramUser;
  query: string;
  offset: string;
}

export interface InlineQueryResult {
  type: "article";
  id: string;
  title: string;
  description?: string;
  input_message_content: {
    message_text: string;
    parse_mode?: string;
  };
  reply_markup?: InlineKeyboardMarkup;
}

export interface InlineKeyboardMarkup {
  inline_keyboard: Array<Array<{ text: string; url?: string; callback_data?: string }>>;
}

// ─── API Methods ─────────────────────────────────────────────────────────────

async function apiCall(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
  const res = await fetch(`${API_BASE}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  const data = await res.json();
  if (!data.ok) {
    console.error(`Telegram API error [${method}]:`, data.description);
  }
  return data.result;
}

export async function sendMessage(
  chatId: number,
  text: string,
  options: {
    parseMode?: "HTML" | "MarkdownV2";
    replyMarkup?: InlineKeyboardMarkup;
    disableWebPagePreview?: boolean;
  } = {},
): Promise<void> {
  await apiCall("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: options.parseMode ?? "HTML",
    reply_markup: options.replyMarkup,
    disable_web_page_preview: options.disableWebPagePreview ?? false,
  });
}

export async function answerCallbackQuery(
  callbackQueryId: string,
  text?: string,
): Promise<void> {
  await apiCall("answerCallbackQuery", {
    callback_query_id: callbackQueryId,
    text,
  });
}

export async function answerInlineQuery(
  inlineQueryId: string,
  results: InlineQueryResult[],
  cacheTime = 60,
): Promise<void> {
  await apiCall("answerInlineQuery", {
    inline_query_id: inlineQueryId,
    results,
    cache_time: cacheTime,
  });
}

export async function setWebhook(url: string): Promise<void> {
  await apiCall("setWebhook", { url, allowed_updates: ["message", "callback_query", "inline_query"] });
  console.log(`Webhook set to: ${url}`);
}

export async function deleteWebhook(): Promise<void> {
  await apiCall("deleteWebhook");
  console.log("Webhook deleted");
}

export async function getUpdates(offset?: number): Promise<TelegramUpdate[]> {
  const result = await apiCall("getUpdates", {
    offset,
    timeout: 30,
    allowed_updates: ["message", "callback_query", "inline_query"],
  });
  return (result as TelegramUpdate[]) ?? [];
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
