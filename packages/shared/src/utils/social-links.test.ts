import { describe, expect, it } from "vitest";
import {
  buildSocialUrl,
  socialNetworkIcon,
  socialNetworkLabel,
} from "./social-links";

describe("buildSocialUrl", () => {
  it("builds tiktok URL з handle (strips leading @)", () => {
    expect(buildSocialUrl("tiktok", "@ltex_lutsk")).toBe(
      "https://www.tiktok.com/@ltex_lutsk",
    );
  });

  it("builds instagram URL", () => {
    expect(buildSocialUrl("instagram", "ltex.lutsk")).toBe(
      "https://www.instagram.com/ltex.lutsk",
    );
  });

  it("builds facebook URL з handle, але якщо handle є URL — використовує його напряму", () => {
    expect(buildSocialUrl("facebook", "ltex")).toBe(
      "https://www.facebook.com/ltex",
    );
    expect(
      buildSocialUrl("facebook", "https://www.facebook.com/profile.php?id=123"),
    ).toBe("https://www.facebook.com/profile.php?id=123");
  });

  it("builds telegram t.me URL", () => {
    expect(buildSocialUrl("telegram", "L_TEX")).toBe("https://t.me/L_TEX");
  });

  it("builds viber://chat URL з phone-like handle", () => {
    expect(buildSocialUrl("viber", "+380 50 123 45 67")).toBe(
      "viber://chat?number=%2B380501234567",
    );
  });

  it("builds whatsapp wa.me URL (без +)", () => {
    expect(buildSocialUrl("whatsapp", "+380501234567")).toBe(
      "https://wa.me/380501234567",
    );
  });

  it("returns browserUrl якщо передано (overrides handle)", () => {
    expect(
      buildSocialUrl("instagram", "ignored", "https://custom.example/page"),
    ).toBe("https://custom.example/page");
  });

  it("returns null для empty handle і empty browserUrl", () => {
    expect(buildSocialUrl("instagram", null)).toBeNull();
    expect(buildSocialUrl("instagram", "")).toBeNull();
    expect(buildSocialUrl("instagram", "   ", "")).toBeNull();
  });

  it("returns null для unknown network without browserUrl", () => {
    expect(buildSocialUrl("myspace", "handle")).toBeNull();
  });
});

describe("socialNetworkIcon", () => {
  it("returns emoji per known network (case-insensitive)", () => {
    expect(socialNetworkIcon("Telegram")).toBe("✈️");
    expect(socialNetworkIcon("viber")).toBe("💬");
    expect(socialNetworkIcon("TIKTOK")).toBe("🎵");
  });

  it("returns generic chain icon для unknown", () => {
    expect(socialNetworkIcon("unknown")).toBe("🔗");
  });
});

describe("socialNetworkLabel", () => {
  it("returns proper-case label per known network", () => {
    expect(socialNetworkLabel("instagram")).toBe("Instagram");
    expect(socialNetworkLabel("whatsapp")).toBe("WhatsApp");
  });

  it("echoes back unknown network", () => {
    expect(socialNetworkLabel("myspace")).toBe("myspace");
  });
});
