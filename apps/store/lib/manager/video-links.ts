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
    key: "hashtags",
    label: "Хештеги (зверху опису)",
    url: "#секондхендоптом #стокоптом",
    sortOrder: 5,
  },
  {
    key: "catalog",
    label: "Переглянути каталог",
    url: "https://new.ltex.com.ua/catalog",
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
    url: "+(380) 67 671 05 16",
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
    key: "telegram",
    label: "Telegram",
    url: "https://t.me/LTEX_Second",
    sortOrder: 60,
  },
  {
    key: "telegram_bric",
    label: "Telegram bric-a-brac",
    url: "https://t.me/LTEX_Bric",
    sortOrder: 70,
  },
  {
    key: "site",
    label: "Сайт",
    url: "http://secondopt.com.ua",
    sortOrder: 80,
  },
  {
    key: "site_bric",
    label: "Сайт bric-a-brac",
    url: "http://bricabrac.com.ua",
    sortOrder: 90,
  },
  {
    key: "tiktok",
    label: "TikTok",
    url: "https://www.tiktok.com/@ltex.second.opt",
    sortOrder: 100,
  },
  {
    key: "instagram",
    label: "Instagram",
    url: "https://instagram.com/ltex_secondopt",
    sortOrder: 110,
  },
  {
    key: "facebook",
    label: "Facebook",
    url: "https://facebook.com/ltexsecond",
    sortOrder: 120,
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
