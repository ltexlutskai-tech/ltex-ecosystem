/**
 * Рівень 1 автозбереження — миттєва локальна копія у localStorage.
 *
 * Рятує від закритої вкладки / зависання браузера / випадкового переходу
 * НАВІТЬ коли сервер недоступний. Чисті хелпери (без React) — легко тестуються.
 *
 * Ключ: `ltex:draft:<docType>:<id|"new">`. Значення — JSON `{ data, savedAt }`.
 */

export interface LocalDraftEnvelope<T> {
  data: T;
  /** ISO-час останнього локального збереження. */
  savedAt: string;
}

/** Ключ localStorage для чернетки форми. */
export function localDraftKey(docType: string, id: string | null): string {
  return `ltex:draft:${docType}:${id ?? "new"}`;
}

function hasStorage(): boolean {
  try {
    return typeof window !== "undefined" && !!window.localStorage;
  } catch {
    return false;
  }
}

/** Записати локальну копію (тихо ковтає помилки квоти/приватного режиму). */
export function writeLocalDraft<T>(
  key: string,
  data: T,
  savedAt: string,
): void {
  if (!hasStorage()) return;
  try {
    const env: LocalDraftEnvelope<T> = { data, savedAt };
    window.localStorage.setItem(key, JSON.stringify(env));
  } catch {
    // Квота/приватний режим — ігноруємо (рівень 2 (БД) усе одно збереже).
  }
}

/** Прочитати локальну копію (null якщо немає/пошкоджена). */
export function readLocalDraft<T>(key: string): LocalDraftEnvelope<T> | null {
  if (!hasStorage()) return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LocalDraftEnvelope<T>;
    if (!parsed || typeof parsed !== "object" || !("data" in parsed)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/** Видалити локальну копію (після успішного проведення / свідомого скасування). */
export function clearLocalDraft(key: string): void {
  if (!hasStorage()) return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

/**
 * Чи локальна копія «новіша» за серверний час збереження. Використовується щоб
 * вирішити, чи показувати банер «Відновити незбережене?». Порівняння за ISO-часом
 * із запасом 2 с (щоб не пропонувати відновлення власного щойно-збереженого).
 */
export function isLocalNewer(
  localSavedAt: string | null | undefined,
  serverSavedAt: string | null | undefined,
): boolean {
  if (!localSavedAt) return false;
  const local = Date.parse(localSavedAt);
  if (Number.isNaN(local)) return false;
  if (!serverSavedAt) return true;
  const server = Date.parse(serverSavedAt);
  if (Number.isNaN(server)) return true;
  return local > server + 2000;
}
