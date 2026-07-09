"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  clearLocalDraft,
  localDraftKey,
  readLocalDraft,
  writeLocalDraft,
} from "./local-draft";

/**
 * Захист незбереженого вводу для форм СТВОРЕННЯ (без серверної чернетки).
 *
 * На відміну від `useRecordAutosave`, тут НЕМАЄ виклику до сервера — лише рівень 1
 * (localStorage): на кожну зміну `data` (debounce ~500 мс) серіалізуємо форму у
 * буфер; при відкритті — якщо буфер непорожній, показуємо банер «Відновити». Сам
 * запис лишається окремою кнопкою; після успішного сабміту викликаємо `clear()`.
 *
 * Рятує від закритої вкладки / зависання браузера / втрати світла до того, як
 * користувач натиснув «Створити».
 */

export interface UseLocalDraftOptions<T> {
  /** Унікальний ключ форми — `ltex:draft:<recordKey>:new`. */
  recordKey: string;
  data: T;
  enabled?: boolean;
  debounceMs?: number;
}

export interface UseLocalDraftResult<T> {
  /** Дані з буфера localStorage для відновлення (null якщо немає). */
  restoreData: T | null;
  /** Свідома відмова — чистить буфер і ховає банер. */
  dismissRestore: () => void;
  /** Прийняти відновлення — ховає банер (буфер лишається до наступного запису). */
  acceptRestore: () => void;
  /** Повне очищення буфера (після успішного сабміту). */
  clear: () => void;
}

export function useLocalDraft<T>(
  opts: UseLocalDraftOptions<T>,
): UseLocalDraftResult<T> {
  const { recordKey, data, enabled = true, debounceMs = 500 } = opts;

  const [restoreData, setRestoreData] = useState<T | null>(null);
  const keyRef = useRef(localDraftKey(recordKey, null));
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(false);
  const initialSnapRef = useRef<string>(JSON.stringify(data));

  useEffect(() => {
    mountedRef.current = true;
    if (!enabled) return;
    const env = readLocalDraft<T>(keyRef.current);
    if (env && env.data != null) setRestoreData(env.data);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!enabled || !mountedRef.current) return;
    const snapStr = JSON.stringify(data);
    // Не пишемо буфер для незміненої початкової форми (порожні поля).
    if (snapStr === initialSnapRef.current) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      writeLocalDraft(keyRef.current, data, new Date().toISOString());
    }, debounceMs);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [data, enabled, debounceMs]);

  const clear = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    clearLocalDraft(keyRef.current);
  }, []);

  const dismissRestore = useCallback(() => {
    clearLocalDraft(keyRef.current);
    setRestoreData(null);
  }, []);

  const acceptRestore = useCallback(() => setRestoreData(null), []);

  return { restoreData, dismissRestore, acceptRestore, clear };
}
