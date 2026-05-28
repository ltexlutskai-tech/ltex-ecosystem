import { NextRequest, NextResponse } from "next/server";
import {
  ingestInboundMessage,
  recordOutboundSystemMessage,
} from "@/lib/chat/inbound";

/**
 * Telegram Bot Webhook handler.
 *
 * Бот працює виключно як канал переписки з менеджером (chat-inbox).
 * Self-service (пошук/лоти/замовлення/каталог) видалений: будь-який
 * вільний текст іде в `ingestInboundMessage` → `/manager/chat`.
 * `/start` → коротке welcome + ingest, щоб менеджер бачив перший контакт.
 * Все інше (sticker/photo/voice/document/callback_query) — silent 200 OK.
 */

const WELCOME_TEXT =
  "👋 Вітаємо в L-TEX! Напишіть ваше повідомлення — менеджер відповість якнайшвидше.";

async function sendMessage(chatId: number, text: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN ?? "";
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      disable_web_page_preview: true,
    }),
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
    // Цікавлять тільки текстові message. Все інше (callback_query, inline_query,
    // edited_message, channel_post, sticker/photo/voice/document) — silent OK.
    if (update.message) {
      const msg = update.message as {
        chat: { id: number };
        from?: {
          first_name?: string;
          last_name?: string;
          username?: string;
        };
        message_id?: number;
        text?: string;
      };
      const chatId = msg.chat.id;
      const text = msg.text?.trim() ?? "";

      if (text.length > 0) {
        // /start теж ingest-имо, щоб менеджер побачив, що клієнт зайшов уперше.
        const name =
          [msg.from?.first_name, msg.from?.last_name]
            .filter((v): v is string => Boolean(v))
            .join(" ") ||
          msg.from?.username ||
          null;
        try {
          await ingestInboundMessage({
            platform: "telegram",
            externalUserId: String(chatId),
            externalUserName: name,
            text,
            phone: null,
            externalMessageId:
              msg.message_id != null ? String(msg.message_id) : null,
          });
        } catch (error) {
          console.warn("[L-TEX] Telegram inbox ingest failed", {
            error: error instanceof Error ? error.message : String(error),
          });
        }

        if (text === "/start") {
          await sendMessage(chatId, WELCOME_TEXT);
          // Залогувати welcome у треді, щоб менеджер бачив, що бот уже відповів.
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
