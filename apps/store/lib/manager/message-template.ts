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
 * обидва trim-аються (порожні після trim не приймаються). `isShared` — чи бачать
 * шаблон інші менеджери (дозвіл дає автор); опційне, дефолт false (приватний).
 * Відсутнє / не-рядкове поле відхиляється на типі (Zod v4).
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
  isShared: z.boolean().optional().default(false),
});

export type MessageTemplateInput = z.infer<typeof messageTemplateSchema>;

/**
 * Вкладки видимості: «Мої» (шаблони, які я створив) vs «Спільні» (шаблони,
 * якими поділилися інші менеджери). Набори не перетинаються.
 */
export type TemplateScope = "mine" | "shared";

/** Мінімум полів, потрібний для фільтрації (щоб хелпери лишались чистими). */
export interface TemplateLike {
  name: string;
  text: string;
  createdByUserId: string | null;
  isShared: boolean;
}

/**
 * Чи належить шаблон до вкладки:
 *  - «Мої»    — автор = поточний користувач (незалежно від isShared);
 *  - «Спільні» — isShared І автор ≠ поточний користувач.
 * Легасі-шаблони без автора (createdByUserId=null) потрапляють лише у «Спільні».
 */
export function templateMatchesScope(
  t: TemplateLike,
  scope: TemplateScope,
  userId: string,
): boolean {
  if (scope === "mine") return t.createdByUserId === userId;
  return t.isShared && t.createdByUserId !== userId;
}

/**
 * Пошук по назві АБО по тексту (вхідне співпадіння, регістронезалежно).
 * Порожній запит матчить усе.
 */
export function templateMatchesQuery(t: TemplateLike, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return t.name.toLowerCase().includes(q) || t.text.toLowerCase().includes(q);
}

/** Комбінований фільтр вкладка + пошук (для клієнтського списку). */
export function filterTemplates<T extends TemplateLike>(
  templates: T[],
  opts: { scope: TemplateScope; userId: string; query: string },
): T[] {
  return templates.filter(
    (t) =>
      templateMatchesScope(t, opts.scope, opts.userId) &&
      templateMatchesQuery(t, opts.query),
  );
}

/**
 * Чи може користувач редагувати/видаляти шаблон: лише автор або admin/owner.
 * Легасі-шаблони без автора керуються лише admin/owner.
 */
export function canManageTemplate(
  t: { createdByUserId: string | null },
  user: { id: string; isAdmin: boolean },
): boolean {
  if (user.isAdmin) return true;
  return t.createdByUserId !== null && t.createdByUserId === user.id;
}
