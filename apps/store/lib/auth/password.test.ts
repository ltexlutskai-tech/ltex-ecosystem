import { describe, it, expect } from "vitest";
import {
  hashPassword,
  verifyPassword,
  generateRandomPassword,
  validatePasswordStrength,
} from "./password";

describe("password", () => {
  it("hashPassword + verifyPassword round-trips", async () => {
    const hash = await hashPassword("Correct-Horse-Battery-42");
    expect(hash).toMatch(/^\$2[aby]\$/);
    expect(hash.length).toBeGreaterThan(40);
    expect(await verifyPassword("Correct-Horse-Battery-42", hash)).toBe(true);
  });

  it("verifyPassword returns false for wrong password", async () => {
    const hash = await hashPassword("Correct-Horse-Battery-42");
    expect(await verifyPassword("wrong-password-1", hash)).toBe(false);
  });

  it("generateRandomPassword returns requested length, base64url charset", () => {
    const pw = generateRandomPassword(16);
    expect(pw).toHaveLength(16);
    expect(pw).toMatch(/^[A-Za-z0-9\-_]+$/);
  });

  it("generateRandomPassword defaults to 16 chars", () => {
    expect(generateRandomPassword()).toHaveLength(16);
  });

  describe("validatePasswordStrength", () => {
    it("accepts strong password", () => {
      expect(validatePasswordStrength("Correct-Horse-1234")).toEqual({
        ok: true,
      });
    });

    it("rejects short password", () => {
      expect(validatePasswordStrength("Short1a")).toEqual({
        ok: false,
        reason: "Мінімум 12 символів",
      });
    });

    it("rejects password without digit", () => {
      expect(validatePasswordStrength("NoDigitsAtAllHere")).toEqual({
        ok: false,
        reason: "Хоча б одна цифра",
      });
    });

    it("rejects password without letter", () => {
      expect(validatePasswordStrength("123456789012345")).toEqual({
        ok: false,
        reason: "Хоча б одна буква",
      });
    });

    it("accepts cyrillic letters", () => {
      expect(validatePasswordStrength("Пароль1234567")).toEqual({ ok: true });
    });
  });
});
