import { describe, it, expect } from "vitest";
import { buildPushPreview } from "./notify";

describe("buildPushPreview", () => {
  it("prefers text when present", () => {
    expect(buildPushPreview({ text: "Привіт", hasImage: true })).toBe("Привіт");
  });
  it("uses docRef label when no text", () => {
    expect(buildPushPreview({ text: "", docRefLabel: "Замовлення №1" })).toBe(
      "📎 Замовлення №1",
    );
  });
  it("labels photo and file", () => {
    expect(buildPushPreview({ hasImage: true })).toBe("📷 Фото");
    expect(buildPushPreview({ hasFile: true })).toBe("📎 Файл");
  });
  it("falls back to a generic label", () => {
    expect(buildPushPreview({})).toBe("Нове повідомлення");
  });
  it("treats whitespace-only text as empty", () => {
    expect(buildPushPreview({ text: "   ", hasFile: true })).toBe("📎 Файл");
  });
});
