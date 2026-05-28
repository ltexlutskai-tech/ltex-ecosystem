import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import {
  ingestInboundMessage,
  recordOutboundSystemMessage,
} from "@/lib/chat/inbound";

/**
 * Viber Bot Webhook handler.
 *
 * Бот працює виключно як канал переписки з менеджером (chat-inbox).
 * Self-service (меню / пошук / лоти / замовлення / категорії) видалений:
 * будь-який вільний текст іде в `ingestInboundMessage` → `/manager/chat`.
 * `conversation_started`/`subscribed`/`/start` → коротке welcome БЕЗ keyboard.
 * Події `delivered`/`seen`/`failed`/`unsubscribed`/`webhook` — no-op 200.
 *
 * Env vars:
 *   VIBER_AUTH_TOKEN — bot auth token
 */

const WELCOME_TEXT =
  "👋 Вітаємо в L-TEX! Напишіть ваше повідомлення — менеджер відповість якнайшвидше.";

async function sendMessage(receiverId: string, text: string): Promise<void> {
  const token = process.env.VIBER_AUTH_TOKEN ?? "";
  await fetch("https://chatapi.viber.com/pa/send_message", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Viber-Auth-Token": token,
    },
    body: JSON.stringify({
      receiver: receiverId,
      type: "text",
      text,
      min_api_version: 7,
    }),
  });
}

/**
 * Опційно дістає телефон користувача через `/pa/get_user_details`.
 * Повертає `null` коли API недоступне / телефон не наданий.
 * Не кидає винятків.
 */
async function fetchViberUserPhone(userId: string): Promise<string | null> {
  const token = process.env.VIBER_AUTH_TOKEN ?? "";
  if (!token) return null;
  try {
    const res = await fetch("https://chatapi.viber.com/pa/get_user_details", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Viber-Auth-Token": token,
      },
      body: JSON.stringify({ id: userId }),
    });
    if (!res.ok) return null;
    const data = (await res.json().catch(() => ({}))) as {
      status?: number;
      user?: { primary_device_os?: string; phone_number?: string };
    };
    if (data.status !== 0) return null;
    return data.user?.phone_number ?? null;
  } catch {
    return null;
  }
}

// ─── Welcome ────────────────────────────────────────────────────────────────

async function handleStart(userId: string, userName?: string): Promise<void> {
  const text = userName ? `${userName}, ${WELCOME_TEXT}` : WELCOME_TEXT;
  await sendMessage(userId, text);
  // Залогувати welcome у треді, щоб менеджер бачив, що бот уже відповів.
  // Для `conversation_started` це теж створить розмову (upsert), щоб
  // тред існував у /manager/chat від першого контакту.
  await recordOutboundSystemMessage({
    platform: "viber",
    externalUserId: userId,
    externalUserName: userName ?? null,
    text,
  });
}

// ─── Webhook POST handler ────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const token = process.env.VIBER_AUTH_TOKEN ?? "";
  if (!token) {
    return NextResponse.json({ error: "Bot not configured" }, { status: 503 });
  }

  // Viber always signs callbacks with the bot auth token. Reject any request
  // that lacks a valid HMAC-SHA256 signature — unsigned callbacks are never OK.
  const signature = request.headers.get("x-viber-content-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 403 });
  }

  const body = await request.text();
  const expectedSig = crypto
    .createHmac("sha256", token)
    .update(body)
    .digest("hex");
  const providedBuf = Buffer.from(signature, "hex");
  const expectedBuf = Buffer.from(expectedSig, "hex");
  if (
    providedBuf.length !== expectedBuf.length ||
    !crypto.timingSafeEqual(providedBuf, expectedBuf)
  ) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
  }

  let event: {
    event: string;
    sender?: { id: string; name?: string };
    user?: { id: string; name?: string };
    message?: { text?: string; type?: string };
    message_token?: number | string;
  };
  try {
    event = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    switch (event.event) {
      case "webhook":
        // Viber sends this to confirm webhook registration — no-op.
        break;

      case "conversation_started":
        // Перший контакт: коротке welcome. НЕ ingest-имо: у Viber подія
        // `conversation_started` спрацьовує при відкритті чату й до
        // реального повідомлення (без `message`).
        if (event.user) {
          await handleStart(event.user.id, event.user.name);
        }
        break;

      case "message":
        if (event.sender && event.message) {
          const userId = event.sender.id;
          const text = event.message.text?.trim() ?? "";
          const messageType = event.message.type ?? "text";
          const messageToken =
            event.message_token != null ? String(event.message_token) : null;

          if (messageType === "text" && text.length > 0) {
            // Будь-який вільний текст — у inbox. /start теж: менеджер
            // побачить, що клієнт зайшов уперше.
            try {
              const phone = await fetchViberUserPhone(userId);
              await ingestInboundMessage({
                platform: "viber",
                externalUserId: userId,
                externalUserName: event.sender.name ?? null,
                text,
                phone,
                externalMessageId: messageToken,
              });
            } catch (error) {
              console.warn("[L-TEX] Viber inbox ingest failed", {
                error: error instanceof Error ? error.message : String(error),
              });
            }

            if (text === "/start") {
              await handleStart(userId, event.sender.name);
            }
          }
          // Non-text повідомлення (picture, video, file, location, contact,
          // sticker, url) — silent ignore у Phase 1.
        }
        break;

      default:
        // subscribed, unsubscribed, delivered, seen, failed — no-op.
        break;
    }
  } catch (error) {
    console.error("[L-TEX] Viber webhook error", {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return NextResponse.json({ status: 0 });
}
