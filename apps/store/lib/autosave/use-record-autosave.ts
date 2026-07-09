"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  clearLocalDraft,
  localDraftKey,
  readLocalDraft,
  writeLocalDraft,
} from "./local-draft";
import type { DocAutosaveStatus } from "./use-document-autosave";

/**
 * Автозбереження запису (картка/довідник) — зміна поля зберігається одразу
 * (debounce ~800 мс) через переданий `save`, з локальним буфером на випадок
 * офлайну. Без концепції «нового id» (запис уже існує або створюється окремо).
 *
 * Використання: передати поточні `data` + `save(data)`. При зміні поля хук сам
 * викличе `save`. Локальний буфер чиститься після успіху; при відкритті з
 * непорожнім буфером — `restoreData` для відновлення.
 */

export interface UseRecordAutosaveOptions<T> {
  /** Унікальний ключ запису — `ltex:draft:<recordKey>`. */
  recordKey: string;
  data: T;
  enabled?: boolean;
  save: (data: T) => Promise<void>;
  debounceMs?: number;
}

export interface UseRecordAutosaveResult<T> {
  status: DocAutosaveStatus;
  savedAt: Date | null;
  restoreData: T | null;
  dismissRestore: () => void;
  acceptRestore: () => void;
  flushNow: () => Promise<void>;
  /** Скинути «брудний» стан на поточні дані (напр. після зовнішнього refresh). */
  reset: () => void;
}

export function useRecordAutosave<T>(
  opts: UseRecordAutosaveOptions<T>,
): UseRecordAutosaveResult<T> {
  const { recordKey, data, enabled = true, save, debounceMs = 800 } = opts;

  const [status, setStatus] = useState<DocAutosaveStatus>("idle");
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [restoreData, setRestoreData] = useState<T | null>(null);

  const keyRef = useRef(localDraftKey(recordKey, null));
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedSnapRef = useRef<string>(JSON.stringify(data));
  const dataRef = useRef<T>(data);
  const mountedRef = useRef(false);
  dataRef.current = data;

  useEffect(() => {
    // mountedRef має стати true незалежно від `enabled` — інакше секції, де
    // редагування вмикається пізніше (рядок картки: `enabled` стартує false і
    // перемикається на true при вході в режим правки), ніколи б не автозберігались.
    mountedRef.current = true;
    if (!enabled) return;
    const env = readLocalDraft<T>(keyRef.current);
    if (env && env.data != null) setRestoreData(env.data);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const doSave = useCallback(async (): Promise<void> => {
    const snap = dataRef.current;
    const snapStr = JSON.stringify(snap);
    if (snapStr === lastSavedSnapRef.current) return;
    setStatus("saving");
    try {
      await save(snap);
      lastSavedSnapRef.current = snapStr;
      clearLocalDraft(keyRef.current);
      setSavedAt(new Date());
      setStatus("saved");
    } catch {
      setStatus("offline");
    }
  }, [save]);

  useEffect(() => {
    if (!enabled || !mountedRef.current) return;
    const snapStr = JSON.stringify(data);
    if (snapStr === lastSavedSnapRef.current) return;
    writeLocalDraft(keyRef.current, data, new Date().toISOString());
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => void doSave(), debounceMs);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [data, enabled, debounceMs, doSave]);

  useEffect(() => {
    if (!enabled) return;
    const onHide = () => {
      if (document.visibilityState === "hidden") {
        if (timerRef.current) clearTimeout(timerRef.current);
        void doSave();
      }
    };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, [enabled, doSave]);

  const flushNow = useCallback(async () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    await doSave();
  }, [doSave]);

  const reset = useCallback(() => {
    lastSavedSnapRef.current = JSON.stringify(dataRef.current);
    clearLocalDraft(keyRef.current);
  }, []);

  const dismissRestore = useCallback(() => {
    clearLocalDraft(keyRef.current);
    setRestoreData(null);
  }, []);
  const acceptRestore = useCallback(() => setRestoreData(null), []);

  return {
    status,
    savedAt,
    restoreData,
    dismissRestore,
    acceptRestore,
    flushNow,
    reset,
  };
}
