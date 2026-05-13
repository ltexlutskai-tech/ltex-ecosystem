import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";

const BCRYPT_COST = 12;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_COST);
}

export async function verifyPassword(
  plain: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export function generateRandomPassword(length = 16): string {
  return randomBytes(length).toString("base64url").slice(0, length);
}

export interface PasswordStrengthResult {
  ok: boolean;
  reason?: string;
}

export function validatePasswordStrength(
  plain: string,
): PasswordStrengthResult {
  if (plain.length < 12) return { ok: false, reason: "Мінімум 12 символів" };
  if (!/[0-9]/.test(plain)) return { ok: false, reason: "Хоча б одна цифра" };
  if (!/[A-Za-zА-Яа-яҐІЇЄ]/.test(plain)) {
    return { ok: false, reason: "Хоча б одна буква" };
  }
  return { ok: true };
}
