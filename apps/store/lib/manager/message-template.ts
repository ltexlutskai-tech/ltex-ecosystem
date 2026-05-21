import { z } from "zod";

/**
 * Manager «Прайс» — Stage 5b message templates (pure logic).
 *
 * Простий довідник готових фраз {назва, текст} — відтворює 1С
 * Catalog.ШаблоныСообщений. Спільний для всіх менеджерів. Чиста (DB-agnostic)
 * валідація тут — тестується окремо; endpoint лише I/O.
 */

/**
 * Zod-схема створення/оновлення шаблону. `name` 1..100, `text` 1..5000 —
 * обидва trim-аються (порожні після trim не приймаються). Відсутнє / не-рядкове
 * поле відхиляється на типі (Zod v4).
 */
export const messageTemplateSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Назва обовʼязкова")
    .max(100, "Назва: максимум 100 символів"),
  text: z
    .string()
    .trim()
    .min(1, "Текст обовʼязковий")
    .max(5000, "Текст: максимум 5000 символів"),
});

export type MessageTemplateInput = z.infer<typeof messageTemplateSchema>;
