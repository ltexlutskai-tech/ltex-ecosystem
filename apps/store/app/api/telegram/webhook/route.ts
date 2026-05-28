import { NextRequest, NextResponse } from "next/server";
import {
  ingestInboundMessage,
  recordOutboundSystemMessage,
  upsertConversation,
} from "@/lib/chat/inbound";
import {
  handleRegistrationStep,
  type IncomingMessage,
  type RegistrationOutcome,
} from "@/lib/chat/registration";
import { UA_REGIONS } from "@/lib/constants/regions";

/**
 * Telegram Bot Webhook handler.
 *
 * Бот працює виключно як канал переписки з менеджером (chat-inbox).
 * Self-service видалений: будь-який вільний текст іде в `ingestInboundMessage`
 * → `/manager/chat`. `/start` → коротке welcome + ingest, щоб менеджер бачив
 * перший контакт. Sticker/photo/voice/document/callback_query — silent 200 OK.
 *
 * Phase 2 (реєстрація через бот):
 *   - Нова розмова → бот сам питає контакт (contact-share кнопка).
 *   - Phone знайдено в DB → link + completed.
 *   - Phone не знайдено → бот питає область (24-кнопкова inline keyboard).
 *   - Область обрана → створюємо MgrClient за мапою область→торговий.
 */

const WELCOME_TEXT =
  "👋 Вітаємо в L-TEX! Напишіть ваше повідомлення — менеджер відповість якнайшвидше.";

interface TelegramKeyboardButton {
  text: string;
  request_contact?: boolean;
}

interface TelegramReplyKeyboard {
  keyboard: TelegramKeyboardButton[][];
  resize_keyboard?: boolean;
  one_time_keyboard?: boolean;
}

interface TelegramRemoveKeyboard {
  remove_keyboard: true;
}

interface TelegramInlineButton {
  text: string;
  callback_data: string;
}

interface TelegramInlineKeyboard {
  inline_keyboard: TelegramInlineButton[][];
}

type TelegramReplyMarkup =
  | TelegramReplyKeyboard
  | TelegramRemoveKeyboard
  | TelegramInlineKeyboard;

async function sendMessage(
  chatId: number,
  text: string,
  replyMarkup?: TelegramReplyMarkup,
): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN ?? "";
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      disable_web_page_preview: true,
      ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
    }),
  });
}

function contactKeyboard(): TelegramReplyKeyboard {
  return {
    keyboard: [[{ text: "📞 Поділитись номером", request_contact: true }]],
    resize_keyboard: true,
    one_time_keyboard: true,
  };
}

function removeKeyboard(): TelegramRemoveKeyboard {
  return { remove_keyboard: true };
}

/**
 * Inline-клавіатура з 24 областями — 2 кнопки в ряд (12 рядів).
 * callback_data = `region:<slug>` — детектується нижче у обробці callback_query.
 */
function regionInlineKeyboard(): TelegramInlineKeyboard {
  const rows: TelegramInlineButton[][] = [];
  for (let i = 0; i < UA_REGIONS.length; i += 2) {
    const row: TelegramInlineButton[] = [
      {
        text: UA_REGIONS[i]!.label,
        callback_data: `region:${UA_REGIONS[i]!.slug}`,
      },
    ];
    const next = UA_REGIONS[i + 1];
    if (next) {
      row.push({
        text: next.label,
        callback_data: `region:${next.slug}`,
      });
    }
    rows.push(row);
  }
  return { inline_keyboard: rows };
}

/**
 * Відповідь бота клієнту з urахуванням outcome state-machine. Шле
 * відповідне повідомлення + keyboard, а також логує системне повідомлення
 * у тред (`recordOutboundSystemMessage`), щоб менеджер бачив що бот робить.
 */
async function applyOutcome(
  chatId: number,
  userName: string | null,
  outcome: RegistrationOutcome,
): Promise<void> {
  if (outcome.kind === "noop") return;

  let text: string;
  let markup: TelegramReplyMarkup | undefined;

  switch (outcome.kind) {
    case "ask_phone":
      text = outcome.promptText;
      markup = contactKeyboard();
      break;
    case "ask_region":
      text = outcome.promptText;
      markup = regionInlineKeyboard();
      break;
    case "linked":
      text = outcome.greeting;
      markup = removeKeyboard();
      break;
    case "registered":
      text = outcome.greeting;
      markup = removeKeyboard();
      break;
    case "unassigned":
      text = outcome.greeting;
      markup = removeKeyboard();
      break;
  }

  await sendMessage(chatId, text, markup);
  await recordOutboundSystemMessage({
    platform: "telegram",
    externalUserId: String(chatId),
    externalUserName: userName,
    text,
  });
}

/**
 * Витягає `IncomingMessage` з Telegram update. `null` коли тип не цікавить
 * (sticker/photo/voice/etc.). Підтримує:
 *   - text (вільний текст або `/start`)
 *   - contact (від кнопки `request_contact`)
 *   - callback_query (натиск inline-кнопки області — `region:<slug>`)
 */
interface TelegramFrom {
  first_name?: string;
  last_name?: string;
  username?: string;
}

interface TelegramContact {
  phone_number?: string;
}

interface TelegramMessage {
  chat: { id: number };
  from?: TelegramFrom;
  message_id?: number;
  text?: string;
  contact?: TelegramContact;
}

interface TelegramCallbackQuery {
  id: string;
  data?: string;
  from?: TelegramFrom;
  message?: TelegramMessage;
}

function userNameOf(from?: TelegramFrom): string | null {
  if (!from) return null;
  return (
    [from.first_name, from.last_name]
      .filter((v): v is string => Boolean(v))
      .join(" ") ||
    from.username ||
    null
  );
}

async function answerCallbackQuery(callbackQueryId: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN ?? "";
  await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ callback_query_id: callbackQueryId }),
  });
}

export async function POST(request: NextRequest) {
  if (!process.env.TELEGRAM_BOT_TOKEN) {
    return NextResponse.json({ error: "Bot not configured" }, { status: 503 });
  }

  // Require the webhook secret to be configured. Without it we cannot verify
  // that the request actually came from Telegram, so we refuse to process it.
  const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!expectedSecret) {
    console.error("TELEGRAM_WEBHOOK_SECRET is not configured");
    return NextResponse.json(
      { error: "Webhook not configured" },
      { status: 503 },
    );
  }
  const secret = request.headers.get("x-telegram-bot-api-secret-token");
  if (secret !== expectedSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let update: Record<string, unknown>;
  try {
    update = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    // ─── callback_query (натиск кнопки області) ─────────────────────────────
    if (update.callback_query) {
      const cb = update.callback_query as TelegramCallbackQuery;
      const data = cb.data ?? "";
      const chatId = cb.message?.chat.id;
      const name = userNameOf(cb.from);

      // Підтверджуємо callback (бо інакше Telegram показує loading 30с).
      // НЕ блокуємо подальшу обробку.
      if (cb.id) {
        void answerCallbackQuery(cb.id);
      }

      if (chatId != null && data.startsWith("region:")) {
        const conv = await upsertConversation({
          platform: "telegram",
          externalUserId: String(chatId),
          externalUserName: name,
        });
        const outcome = await handleRegistrationStep({
          conversation: conv,
          message: {
            type: "region_select",
            regionSlug: data.slice("region:".length),
          },
        });
        await applyOutcome(chatId, name, outcome);
      }
      return NextResponse.json({ ok: true });
    }

    // ─── message (text АБО contact) ─────────────────────────────────────────
    if (update.message) {
      const msg = update.message as TelegramMessage;
      const chatId = msg.chat.id;
      const text = msg.text?.trim() ?? "";
      const contactPhone = msg.contact?.phone_number ?? null;
      const name = userNameOf(msg.from);
      const messageId = msg.message_id != null ? String(msg.message_id) : null;

      // Якщо нема ані тексту, ані контакту — silent OK (sticker/photo/voice).
      if (text.length === 0 && !contactPhone) {
        return NextResponse.json({ ok: true });
      }

      // Upsert + state-machine для реєстрації.
      const conv = await upsertConversation({
        platform: "telegram",
        externalUserId: String(chatId),
        externalUserName: name,
      });

      const incoming: IncomingMessage = contactPhone
        ? { type: "contact", phone: contactPhone }
        : { type: "text", text };

      const outcome = await handleRegistrationStep({
        conversation: conv,
        message: incoming,
      });

      if (outcome.kind !== "noop") {
        // У реєстрації — бот веде діалог. Текстові «нагадування» НЕ ingest-имо
        // у inbox як client message (бо це службовий tap на кнопку / спроба
        // обійти keyboard). Лишаємо лише бот-відповідь у треді через
        // applyOutcome().
        await applyOutcome(chatId, name, outcome);
        return NextResponse.json({ ok: true });
      }

      // Noop = вже linked / completed / legacy → звичайний ingest.
      if (text.length > 0) {
        try {
          await ingestInboundMessage({
            platform: "telegram",
            externalUserId: String(chatId),
            externalUserName: name,
            text,
            phone: null,
            externalMessageId: messageId,
          });
        } catch (error) {
          console.warn("[L-TEX] Telegram inbox ingest failed", {
            error: error instanceof Error ? error.message : String(error),
          });
        }

        // Legacy /start (для розмов де реєстрація вже completed) — підтвердимо
        // welcome як було. Нова розмова отримує welcome через state-machine.
        if (text === "/start") {
          await sendMessage(chatId, WELCOME_TEXT, removeKeyboard());
          await recordOutboundSystemMessage({
            platform: "telegram",
            externalUserId: String(chatId),
            externalUserName: name,
            text: WELCOME_TEXT,
          });
        }
      }
    }
  } catch (error) {
    console.error("[L-TEX] Telegram webhook error", {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  // Always return 200 to Telegram
  return NextResponse.json({ ok: true });
}
