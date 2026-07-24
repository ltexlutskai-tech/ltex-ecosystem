import { describe, expect, it } from "vitest";
import {
  CHAT_PLATFORMS,
  chatPlatformLabel,
  getChatPlatformMeta,
  listChatPlatforms,
} from "./platforms";

// Дзеркалить enum `ChatPlatform` (schema.prisma). Якщо додається платформа —
// цей список і реєстр мають оновитись разом (а `getPlatformSender` — впаде на
// exhaustive-never, поки не додаси гілку).
const EXPECTED_PLATFORMS = [
  "telegram",
  "viber",
  "whatsapp",
  "instagram",
  "facebook",
  "tiktok",
] as const;

describe("CHAT_PLATFORMS registry", () => {
  it("покриває кожну очікувану платформу з коректним key", () => {
    for (const p of EXPECTED_PLATFORMS) {
      const meta = CHAT_PLATFORMS[p];
      expect(meta, `немає запису для ${p}`).toBeDefined();
      expect(meta.key).toBe(p);
      expect(meta.label.length).toBeGreaterThan(0);
      expect(meta.icon.length).toBeGreaterThan(0);
      expect(typeof meta.outbound).toBe("boolean");
    }
  });

  it("не містить зайвих платформ поза очікуваним набором", () => {
    expect(Object.keys(CHAT_PLATFORMS).sort()).toEqual(
      [...EXPECTED_PLATFORMS].sort(),
    );
  });

  it("Telegram і Viber — робочі канали для відповіді (outbound)", () => {
    expect(CHAT_PLATFORMS.telegram.outbound).toBe(true);
    expect(CHAT_PLATFORMS.viber.outbound).toBe(true);
  });

  it("нові канали (Facebook/TikTok/Instagram/WhatsApp) поки без відповіді", () => {
    expect(CHAT_PLATFORMS.facebook.outbound).toBe(false);
    expect(CHAT_PLATFORMS.tiktok.outbound).toBe(false);
    expect(CHAT_PLATFORMS.instagram.outbound).toBe(false);
    expect(CHAT_PLATFORMS.whatsapp.outbound).toBe(false);
  });

  it("listChatPlatforms повертає всі платформи у порядку order", () => {
    const list = listChatPlatforms();
    expect(list).toHaveLength(EXPECTED_PLATFORMS.length);
    const orders = list.map((m) => m.order);
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
  });

  it("getChatPlatformMeta має fallback (link) для невідомого значення", () => {
    const meta = getChatPlatformMeta("myspace");
    expect(meta.icon).toBe("link");
    expect(meta.outbound).toBe(false);
    expect(meta.label).toBe("myspace");
  });

  it("chatPlatformLabel повертає людську назву", () => {
    expect(chatPlatformLabel("telegram")).toBe("Telegram");
    expect(chatPlatformLabel("viber")).toBe("Viber");
  });
});
