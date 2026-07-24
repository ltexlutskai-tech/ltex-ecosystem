import type { ChatPlatform } from "@ltex/db";
import type { BrandIconKind } from "@/app/manager/(workstation)/_components/brand-icons";

/**
 * ЄДИНЕ ДЖЕРЕЛО ПРАВДИ про платформи об'єднаного месенджера L-TEX.
 *
 * Список / картка клієнта / inbox / фабрика sender-ів читають саме звідси, тому
 * ДОДАВАННЯ НОВОГО КАНАЛУ (Facebook / TikTok / Instagram DM / власний чат-бот) —
 * це:
 *   1) значення в enum `ChatPlatform` (schema.prisma + міграція),
 *   2) запис у `CHAT_PLATFORMS` нижче (мітка / іконка / порядок / чи вміє слати),
 *   3) гілка у `getPlatformSender` (`lib/chat/platform-send.ts`),
 *   4) вебхук, що кличе `ingestInboundMessage({ platform, … })`.
 * Жодних змін у картці клієнта / списку / inbox — вони параметризовані реєстром.
 *
 * `outbound` — чи можемо ВІДПОВІДАТИ клієнту через API платформи. Де немає
 * (WhatsApp/Instagram/Facebook/TikTok поки) — тред read-only на відповідь, у
 * UI показуємо підказку. Telegram/Viber мають робочих бот-sender-ів.
 */
export interface ChatPlatformMeta {
  /** Ключ платформи (== значення enum ChatPlatform). */
  key: ChatPlatform;
  /** Людська назва для UI. */
  label: string;
  /** Kind для `<BrandIcon>` (офіційний лого-гліф). */
  icon: BrandIconKind;
  /** Порядок показу у списках вибору платформ. */
  order: number;
  /** Чи підтримується вихідна відповідь через API платформи. */
  outbound: boolean;
}

export const CHAT_PLATFORMS: Record<ChatPlatform, ChatPlatformMeta> = {
  telegram: {
    key: "telegram",
    label: "Telegram",
    icon: "telegram",
    order: 1,
    outbound: true,
  },
  viber: {
    key: "viber",
    label: "Viber",
    icon: "viber",
    order: 2,
    outbound: true,
  },
  whatsapp: {
    key: "whatsapp",
    label: "WhatsApp",
    icon: "whatsapp",
    order: 3,
    outbound: false,
  },
  instagram: {
    key: "instagram",
    label: "Instagram",
    icon: "instagram",
    order: 4,
    outbound: false,
  },
  facebook: {
    key: "facebook",
    label: "Facebook",
    icon: "facebook",
    order: 5,
    outbound: false,
  },
  tiktok: {
    key: "tiktok",
    label: "TikTok",
    icon: "tiktok",
    order: 6,
    outbound: false,
  },
};

/** Метадані платформи (з fallback на link-іконку для невідомого значення). */
export function getChatPlatformMeta(platform: string): ChatPlatformMeta {
  return (
    CHAT_PLATFORMS[platform as ChatPlatform] ?? {
      key: platform as ChatPlatform,
      label: platform,
      icon: "link",
      order: 99,
      outbound: false,
    }
  );
}

/** Людська назва платформи. */
export function chatPlatformLabel(platform: string): string {
  return getChatPlatformMeta(platform).label;
}

/** Усі платформи у порядку показу. */
export function listChatPlatforms(): ChatPlatformMeta[] {
  return Object.values(CHAT_PLATFORMS).sort((a, b) => a.order - b.order);
}
