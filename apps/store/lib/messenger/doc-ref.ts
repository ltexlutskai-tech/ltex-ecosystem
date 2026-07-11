import { z } from "zod";
import type { MessengerDocRef } from "./types";

export const DOC_REF_TYPES = [
  "order",
  "sale",
  "route",
  "client",
  "product",
  "lot",
  "payment",
  "print",
] as const;

/**
 * Zod-схема посилання на документ. `url` мусить бути ВНУТРІШНІМ шляхом
 * (/manager/...) — це блокує вставку зовнішніх/фішингових посилань як «карток
 * документа».
 */
export const docRefSchema = z.object({
  type: z.enum(DOC_REF_TYPES),
  label: z.string().trim().min(1).max(200),
  subtitle: z.string().trim().max(200).optional(),
  url: z
    .string()
    .trim()
    .min(1)
    .max(500)
    .refine((u) => u.startsWith("/manager/"), "Лише внутрішні посилання"),
});

/** Безпечно приводить збережений JSON до MessengerDocRef (або null). */
export function parseStoredDocRef(value: unknown): MessengerDocRef | null {
  if (!value || typeof value !== "object") return null;
  const parsed = docRefSchema.safeParse(value);
  if (!parsed.success) return null;
  return parsed.data;
}
