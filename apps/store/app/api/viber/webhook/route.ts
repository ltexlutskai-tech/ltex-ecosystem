import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
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
 * Viber Bot Webhook handler.
 *
 * Бот працює виключно як канал переписки з менеджером (chat-inbox).
 * Self-service видалений: будь-який вільний текст іде в `ingestInboundMessage`
 * → `/manager/chat`. Phase 2: state machine реєстрації нового клієнта.
 *
 * Env vars: VIBER_AUTH_TOKEN
 */

const WELCOME_TEXT =
  "👋 Вітаємо в L-TEX! Напишіть ваше повідомлення — менеджер відповість якнайшвидше.";

// ─── Viber keyboard types ───────────────────────────────────────────────────

interface ViberKeyboardButton {
  Columns: number;
  Rows: number;
  ActionType: "reply" | "share-phone" | "open-url" | "none";
  ActionBody: string;
  Text: string;
  TextSize?: "small" | "regular" | "large";
  TextHAlign?: "left" | "center" | "right";
  TextVAlign?: "top" | "middle" | "bottom";
  BgColor?: string;
  TextColor?: string;
}

interface ViberKeyboard {
  Type: "keyboard";
  Buttons: ViberKeyboardButton[];
  DefaultHeight?: boolean;
}

async function sendMessage(
  receiverId: string,
  text: string,
  keyboard?: ViberKeyboard,
): Promise<void> {
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
      ...(keyboard ? { keyboard } : {}),
    }),
  });
}

function contactKeyboard(): ViberKeyboard {
  return {
    Type: "keyboard",
    DefaultHeight: true,
    Buttons: [
      {
        Columns: 6,
        Rows: 1,
        ActionType: "share-phone",
        ActionBody: "+38",
        Text: "📞 Поділитись номером",
        TextSize: "regular",
        TextHAlign: "center",
        TextVAlign: "middle",
        BgColor: "#22c55e",
        TextColor: "#ffffff",
      },
    ],
  };
}

/**
 * Viber-клавіатура з 24 областями — 2 кнопки в ряд → кожна `Columns: 3`
 * (Viber керує grid через 6-колонкову сітку). ActionType=reply, ActionBody=
 * `region:<slug>` — детектується далі у обробці тексту.
 */
function regionKeyboard(): ViberKeyboard {
  return {
    Type: "keyboard",
    DefaultHeight: true,
    Buttons: UA_REGIONS.map((r) => ({
      Columns: 3,
      Rows: 1,
      ActionType: "reply",
      ActionBody: `region:${r.slug}`,
      Text: r.label,
      TextSize: "regular",
      TextHAlign: "center",
      TextVAlign: "middle",
      BgColor: "#f1f5f9",
      TextColor: "#0f172a",
    })),
  };
}

/**
 * Опційно дістає телефон користувача через `/pa/get_user_details`.
 * Повертає `null` коли API недоступне / телефон не наданий.
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

/**
 * Відповідь бота клієнту з urахуванням outcome state-machine.
 */
async function applyOutcome(
  userId: string,
  userName: string | null,
  outcome: RegistrationOutcome,
): Promise<void> {
  if (outcome.kind === "noop") return;

  let text: string;
  let keyboard: ViberKeyboard | undefined;

  switch (outcome.kind) {
    case "ask_phone":
      text = outcome.promptText;
      keyboard = contactKeyboard();
      break;
    case "ask_region":
      text = outcome.promptText;
      keyboard = regionKeyboard();
      break;
    case "linked":
    case "registered":
    case "unassigned":
      text = outcome.greeting;
      keyboard = undefined; // прибрати keyboard після завершення
      break;
  }

  await sendMessage(userId, text, keyboard);
  await recordOutboundSystemMessage({
    platform: "viber",
    externalUserId: userId,
    externalUserName: userName,
    text,
  });
}

// ─── Webhook POST handler ────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const token = process.env.VIBER_AUTH_TOKEN ?? "";
  if (!token) {
    return NextResponse.json({ error: "Bot not configured" }, { status: 503 });
  }

  // Viber always signs callbacks with the bot auth token.
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
    message?: {
      text?: string;
      type?: string;
      contact?: { phone_number?: string };
    };
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
        // Перший контакт (відкриття чату ДО першого повідомлення). Phase 2:
        // запустити state-machine, щоб бот сам надіслав welcome+contact-keyboard.
        if (event.user) {
          const conv = await upsertConversation({
            platform: "viber",
            externalUserId: event.user.id,
            externalUserName: event.user.name ?? null,
          });
          const outcome = await handleRegistrationStep({
            conversation: conv,
            // Trigger entry-state без явного повідомлення — викидаємо порожній
            // text, він не вплине на flow (registrationStep===null → ask_phone
            // незалежно від message).
            message: { type: "text", text: "" },
          });
          if (outcome.kind !== "noop") {
            await applyOutcome(event.user.id, event.user.name ?? null, outcome);
          } else {
            // Для legacy completed-розмов — просто welcome.
            const name = event.user.name;
            const text = name ? `${name}, ${WELCOME_TEXT}` : WELCOME_TEXT;
            await sendMessage(event.user.id, text);
            await recordOutboundSystemMessage({
              platform: "viber",
              externalUserId: event.user.id,
              externalUserName: name ?? null,
              text,
            });
          }
        }
        break;

      case "message":
        if (event.sender && event.message) {
          const userId = event.sender.id;
          const userName = event.sender.name ?? null;
          const text = event.message.text?.trim() ?? "";
          const messageType = event.message.type ?? "text";
          const messageToken =
            event.message_token != null ? String(event.message_token) : null;
          const contactPhone = event.message.contact?.phone_number ?? null;

          // Phase 2: contact share від клієнта приходить як type:"contact"
          // з вкладеним contact.phone_number.
          if (messageType === "contact" && contactPhone) {
            const conv = await upsertConversation({
              platform: "viber",
              externalUserId: userId,
              externalUserName: userName,
            });
            const outcome = await handleRegistrationStep({
              conversation: conv,
              message: { type: "contact", phone: contactPhone },
            });
            await applyOutcome(userId, userName, outcome);
            break;
          }

          // Нормальний текст (вільний або вибір регіону через reply-кнопку).
          if (messageType === "text" && text.length > 0) {
            const conv = await upsertConversation({
              platform: "viber",
              externalUserId: userId,
              externalUserName: userName,
            });

            const incoming: IncomingMessage = text.startsWith("region:")
              ? {
                  type: "region_select",
                  regionSlug: text.slice("region:".length),
                }
              : { type: "text", text };

            const outcome = await handleRegistrationStep({
              conversation: conv,
              message: incoming,
            });

            if (outcome.kind !== "noop") {
              await applyOutcome(userId, userName, outcome);
              break;
            }

            // Noop = звичайний ingest.
            try {
              const phone = await fetchViberUserPhone(userId);
              await ingestInboundMessage({
                platform: "viber",
                externalUserId: userId,
                externalUserName: userName,
                text,
                phone,
                externalMessageId: messageToken,
              });
            } catch (error) {
              console.warn("[L-TEX] Viber inbox ingest failed", {
                error: error instanceof Error ? error.message : String(error),
              });
            }

            // Legacy /start — повторити welcome.
            if (text === "/start") {
              const wtext = userName
                ? `${userName}, ${WELCOME_TEXT}`
                : WELCOME_TEXT;
              await sendMessage(userId, wtext);
              await recordOutboundSystemMessage({
                platform: "viber",
                externalUserId: userId,
                externalUserName: userName,
                text: wtext,
              });
            }
          }
          // picture, video, file, location, sticker, url — silent у Phase 1+2.
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
