import { prisma } from "@ltex/db";
import type { VideoLinkMap } from "@/lib/manager/video-description";

/**
 * Довідник посилань для YouTube-опису відеоогляду (Відеозона).
 *
 * Дефолти нижче — стартові значення (з узгодженого з user шаблону, 2026-07-23).
 * Реальні значення зберігаються в `MgrVideoLink` і перекривають дефолти —
 * `getVideoLinks()` зливає рядки БД поверх дефолтів за ключем. Повне UI
 * редагування довідника — Stage 2; поки редагується напряму в БД / сідом.
 */

export interface VideoLinkDef {
  key: string;
  /** Людська назва рядка (для майбутнього UI редагування). */
  label: string;
  /** Значення за замовчуванням (URL / телефон / адреса). */
  url: string;
  sortOrder: number;
}

export const VIDEO_LINK_DEFS: VideoLinkDef[] = [
  {
    key: "price_list",
    label: "Отримати прайс лист",
    url: "https://ltex.minisite.ai/",
    sortOrder: 10,
  },
  {
    key: "address",
    label: "Адреса складу",
    url: "м. Луцьк, с. Піддубці, вул. Київська, 7а",
    sortOrder: 20,
  },
  {
    key: "phone",
    label: "Зателефонувати",
    url: "+380 67 671 05 15",
    sortOrder: 30,
  },
  {
    key: "write_us",
    label: "Написати нам",
    url: "https://t.me/L_TEX",
    sortOrder: 40,
  },
  {
    key: "viber_group",
    label: "Група Viber",
    url: "",
    sortOrder: 50,
  },
  {
    key: "site",
    label: "Сайт",
    url: "https://new.ltex.com.ua",
    sortOrder: 60,
  },
  {
    key: "tiktok",
    label: "TikTok",
    url: "",
    sortOrder: 70,
  },
  {
    key: "instagram",
    label: "Instagram",
    url: "",
    sortOrder: 80,
  },
  {
    key: "facebook",
    label: "Facebook",
    url: "",
    sortOrder: 90,
  },
  {
    key: "telegram",
    label: "Telegram",
    url: "https://t.me/L_TEX",
    sortOrder: 100,
  },
];

/** Дефолтна мапа key → url (без звернення до БД). */
export function defaultVideoLinkMap(): VideoLinkMap {
  const map: VideoLinkMap = {};
  for (const d of VIDEO_LINK_DEFS) map[d.key] = d.url;
  return map;
}

/**
 * Повертає мапу посилань: дефолти, перекриті рядками `MgrVideoLink` з БД.
 * Best-effort — при помилці БД повертає самі дефолти.
 */
export async function getVideoLinks(): Promise<VideoLinkMap> {
  const map = defaultVideoLinkMap();
  try {
    const rows = await prisma.mgrVideoLink.findMany({
      select: { key: true, url: true },
    });
    for (const r of rows) {
      // Порожній рядок у БД трактуємо як «не задано» → лишаємо дефолт.
      if (r.url && r.url.trim()) map[r.key] = r.url.trim();
    }
  } catch (err) {
    console.error("[L-TEX] getVideoLinks failed", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
  return map;
}
