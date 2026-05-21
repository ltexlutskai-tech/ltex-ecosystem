import { describe, it, expect } from "vitest";
import {
  telegramShareUrl,
  whatsappShareUrl,
  viberShareUrl,
  MESSENGER_SHARE_BUILDERS,
} from "./messenger-links";

const SAMPLE = "Привіт, ціна 10 €/кг & знижка?";

describe("messenger-links", () => {
  it("telegramShareUrl URL-encodes the text", () => {
    const url = telegramShareUrl(SAMPLE);
    expect(url).toBe(
      `https://t.me/share/url?url=&text=${encodeURIComponent(SAMPLE)}`,
    );
    expect(url).toContain("%20"); // space encoded
    expect(url).toContain("%26"); // ampersand encoded
  });

  it("whatsappShareUrl URL-encodes the text", () => {
    const url = whatsappShareUrl(SAMPLE);
    expect(url).toBe(`https://wa.me/?text=${encodeURIComponent(SAMPLE)}`);
    expect(url).toContain("%20");
  });

  it("viberShareUrl uses viber://forward scheme + encodes text", () => {
    const url = viberShareUrl(SAMPLE);
    expect(url).toBe(`viber://forward?text=${encodeURIComponent(SAMPLE)}`);
    expect(url.startsWith("viber://forward?text=")).toBe(true);
  });

  it("encodes newlines (multi-line share text)", () => {
    const multi = "Рядок 1\nРядок 2";
    expect(telegramShareUrl(multi)).toContain("%0A");
    expect(whatsappShareUrl(multi)).toContain("%0A");
    expect(viberShareUrl(multi)).toContain("%0A");
  });

  it("MESSENGER_SHARE_BUILDERS maps each messenger to its builder", () => {
    expect(MESSENGER_SHARE_BUILDERS.telegram(SAMPLE)).toBe(
      telegramShareUrl(SAMPLE),
    );
    expect(MESSENGER_SHARE_BUILDERS.whatsapp(SAMPLE)).toBe(
      whatsappShareUrl(SAMPLE),
    );
    expect(MESSENGER_SHARE_BUILDERS.viber(SAMPLE)).toBe(viberShareUrl(SAMPLE));
  });
});
