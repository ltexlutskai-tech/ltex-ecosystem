import { prisma } from "@ltex/db";
import type { ChatConversation, ChatRegistrationStep } from "@ltex/db";
import { normalizePhone } from "@ltex/shared";
import {
  UA_REGIONS,
  UA_REGION_SLUGS,
  getRegionLabel,
  isValidRegionSlug,
} from "@/lib/constants/regions";
import { matchClientByPhone } from "./phone-match";

/**
 * Чат-inbox Phase 2 — реєстрація нового клієнта через бот.
 *
 * State machine (`ChatConversation.registrationStep`):
 *   null              — legacy розмова (Phase 1) → noop (нічого не питаємо)
 *   awaiting_phone    — нова розмова, чекаємо contact-share
 *   awaiting_region   — phone отримано, не знайдено в базі, питаємо область
 *   completed         — клієнт прив'язаний (по phone або після реєстрації)
 *   unassigned        — клієнт зареєстрований, але регіон без менеджера
 *
 * Викликається webhook-handler-ом на КОЖНЕ вхідне повідомлення ПЕРЕД
 * `ingestInboundMessage`. Якщо повертає не-`noop` outcome — webhook handler
 * шле відповідь клієнту (welcome / contact-keyboard / region-keyboard /
 * thank-you) і НЕ ingest-ить повідомлення-системний-tap у inbox як звичайний
 * client message (бо contact-tap або region-click — це бот-діалог, не питання
 * до менеджера). Якщо `noop` — webhook handler продовжує звичайний ingest.
 */

// ─── Тексти ────────────────────────────────────────────────────────────────
export const WELCOME_PROMPT_PHONE =
  "👋 Вітаємо в L-TEX!\n\nЩоб зв'язати вас із менеджером, будь ласка, поділіться номером телефону кнопкою нижче ⬇️\n\nМи використаємо номер лише щоб знайти вас у нашій базі.";

export const NEED_PHONE_REMINDER =
  "Будь ласка, скористайтесь кнопкою «📞 Поділитись номером» нижче ⬇️";

export const ASK_REGION_PROMPT =
  "Дякуємо! Ви ще не наш клієнт.\n\nОберіть вашу область — ми підключимо відповідного менеджера:";

export const NEED_REGION_REMINDER =
  "Будь ласка, оберіть область з кнопок нижче ⬇️";

function welcomeBackText(name: string | null, managerName: string | null) {
  const who = name ? `Раді вітати знову, ${name}!` : "Раді вітати знову!";
  const mgr = managerName
    ? `Ваш менеджер: ${managerName}.`
    : "Менеджер незабаром зв'яжеться.";
  return `✅ ${who}\n${mgr}\n\nНапишіть ваше повідомлення — він відповість.`;
}

function registeredText(managerName: string | null) {
  if (managerName) {
    return `✅ Дякуємо за реєстрацію!\nВаш менеджер: ${managerName}.\n\nНапишіть ваше повідомлення — він відповість.`;
  }
  return "✅ Дякуємо за реєстрацію!\nМенеджер незабаром зв'яжеться з вами. Можете вже зараз залишити повідомлення.";
}

const UNASSIGNED_TEXT =
  "✅ Дякуємо за реєстрацію!\nМенеджер незабаром зв'яжеться з вами. Можете вже зараз залишити повідомлення.";

// ─── Result types ──────────────────────────────────────────────────────────

export type RegistrationOutcome =
  | { kind: "ask_phone"; promptText: string }
  | { kind: "ask_region"; promptText: string; regionSlugs: readonly string[] }
  | { kind: "linked"; managerName: string | null; greeting: string }
  | { kind: "registered"; managerName: string | null; greeting: string }
  | { kind: "unassigned"; greeting: string }
  | { kind: "noop" };

export type IncomingMessage =
  | { type: "text"; text: string }
  | { type: "contact"; phone: string }
  | { type: "region_select"; regionSlug: string };

export interface HandleRegistrationArgs {
  conversation: Pick<
    ChatConversation,
    "id" | "clientId" | "registrationStep" | "pendingPhone" | "externalUserName"
  >;
  message: IncomingMessage;
}

// ─── Helpers ───────────────────────────────────────────────────────────────

/** Виставляє/чистить `registrationStep` (і опційно `pendingPhone`). */
export async function setRegistrationStep(
  conversationId: string,
  step: ChatRegistrationStep | null,
  pendingPhone?: string | null,
): Promise<void> {
  const data: {
    registrationStep: ChatRegistrationStep | null;
    pendingPhone?: string | null;
  } = { registrationStep: step };
  if (pendingPhone !== undefined) {
    data.pendingPhone = pendingPhone;
  }
  await prisma.chatConversation.update({
    where: { id: conversationId },
    data,
  });
}

/** Резолвить ім'я менеджера за `User.id`, або повертає `null`. */
async function getManagerName(userId: string | null): Promise<string | null> {
  if (!userId) return null;
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { fullName: true },
  });
  return u?.fullName ?? null;
}

/** Витягує region slug з тексту (callback_data `region:<slug>` або голий slug). */
export function extractRegionSlug(text: string): string | null {
  const trimmed = text.trim();
  const withPrefix = trimmed.startsWith("region:")
    ? trimmed.slice("region:".length)
    : trimmed;
  return isValidRegionSlug(withPrefix) ? withPrefix : null;
}

// ─── State machine ─────────────────────────────────────────────────────────

/**
 * Зрушує state machine реєстрації на 1 крок. Чистий, обмежений лише по
 * 4 запитах до Prisma (upsert/update/findFirst/findUnique). Жодних винятків
 * назовні — webhook handler не має на них реагувати.
 */
export async function handleRegistrationStep(
  args: HandleRegistrationArgs,
): Promise<RegistrationOutcome> {
  const { conversation, message } = args;

  // (0) Вже linked / completed / unassigned → нічого не робимо.
  // Це покриває: legacy розмови з clientId, Phase 1 матчі (conv.clientId !== null),
  // повторні візити вже зареєстрованого клієнта.
  if (conversation.clientId) return { kind: "noop" };
  if (
    conversation.registrationStep === "completed" ||
    conversation.registrationStep === "unassigned"
  ) {
    return { kind: "noop" };
  }

  // (1) Нова розмова: `registrationStep === null` І `clientId === null`.
  if (conversation.registrationStep === null) {
    await setRegistrationStep(conversation.id, "awaiting_phone");
    return { kind: "ask_phone", promptText: WELCOME_PROMPT_PHONE };
  }

  // (2) awaiting_phone
  if (conversation.registrationStep === "awaiting_phone") {
    // Очікуємо contact-share. Якщо прийшов текст — нагадуємо про кнопку
    // (НЕ міняємо step).
    if (message.type !== "contact") {
      return { kind: "ask_phone", promptText: NEED_PHONE_REMINDER };
    }

    const normalized = normalizePhone(message.phone);
    if (!normalized) {
      // Невалідний phone (рідко, але можливо) — нагадаємо.
      return { kind: "ask_phone", promptText: NEED_PHONE_REMINDER };
    }

    const match = await matchClientByPhone(normalized);
    if (match) {
      // Phone matched — link до існуючого MgrClient.
      await prisma.chatConversation.update({
        where: { id: conversation.id },
        data: {
          clientId: match.clientId,
          agentUserId: match.agentUserId,
          phone: match.phone,
          registrationStep: "completed",
          pendingPhone: null,
        },
      });
      const managerName = await getManagerName(match.agentUserId);
      return {
        kind: "linked",
        managerName,
        greeting: welcomeBackText(
          conversation.externalUserName ?? null,
          managerName,
        ),
      };
    }

    // Phone не знайдено — зберігаємо у `pendingPhone`, питаємо область.
    await prisma.chatConversation.update({
      where: { id: conversation.id },
      data: {
        registrationStep: "awaiting_region",
        pendingPhone: normalized,
        phone: normalized,
      },
    });
    return {
      kind: "ask_region",
      promptText: ASK_REGION_PROMPT,
      regionSlugs: UA_REGION_SLUGS,
    };
  }

  // (3) awaiting_region
  if (conversation.registrationStep === "awaiting_region") {
    let regionSlug: string | null = null;
    if (message.type === "region_select") {
      regionSlug = isValidRegionSlug(message.regionSlug)
        ? message.regionSlug
        : null;
    } else if (message.type === "text") {
      regionSlug = extractRegionSlug(message.text);
    }
    // contact-share під час awaiting_region — ігноруємо як invalid action.

    if (!regionSlug) {
      return {
        kind: "ask_region",
        promptText: NEED_REGION_REMINDER,
        regionSlugs: UA_REGION_SLUGS,
      };
    }

    const phone = conversation.pendingPhone;
    if (!phone) {
      // Defensive: pendingPhone має бути виставлений з awaiting_phone.
      // Якщо нема — скидаємо до awaiting_phone (рідко, але можливо при ручному
      // зміненні стану).
      await setRegistrationStep(conversation.id, "awaiting_phone", null);
      return { kind: "ask_phone", promptText: WELCOME_PROMPT_PHONE };
    }

    const regionLabel = getRegionLabel(regionSlug);
    const agentMap = await prisma.mgrRegionAgent.findUnique({
      where: { region: regionSlug },
      select: { userId: true },
    });
    const agentUserId = agentMap?.userId ?? null;

    // Створюємо MgrClient. Якщо `agentUserId` null — registrationStep =
    // "unassigned" (admin розрулить руками).
    const clientName = conversation.externalUserName?.trim() || phone;
    const newClient = await prisma.mgrClient.create({
      data: {
        name: clientName,
        phonePrimary: phone,
        region: regionLabel,
        agentUserId,
      },
      select: { id: true },
    });

    await prisma.chatConversation.update({
      where: { id: conversation.id },
      data: {
        clientId: newClient.id,
        agentUserId,
        phone,
        registrationStep: agentUserId ? "completed" : "unassigned",
        pendingPhone: null,
      },
    });

    if (!agentUserId) {
      return { kind: "unassigned", greeting: UNASSIGNED_TEXT };
    }

    const managerName = await getManagerName(agentUserId);
    return {
      kind: "registered",
      managerName,
      greeting: registeredText(managerName),
    };
  }

  // Exhaustive fallback (TypeScript): жоден інший стан не повинен сюди потрапити.
  return { kind: "noop" };
}

// Re-export UA_REGIONS на випадок зручного імпорту з registration модулю.
export { UA_REGIONS, UA_REGION_SLUGS };
