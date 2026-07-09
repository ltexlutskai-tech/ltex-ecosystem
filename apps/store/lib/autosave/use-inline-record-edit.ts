"use client";

import { useCallback, useRef, useState } from "react";
import { useRecordAutosave } from "./use-record-autosave";
import type { DocAutosaveStatus } from "./use-document-autosave";

/**
 * Обгортка над `useRecordAutosave` для inline-редагування РЯДКА довідника/картки.
 *
 * Тримає локальні поля рядка (`fields`), автозберігає будь-яку зміну одразу
 * (debounce ~800 мс) через переданий `save`, з локальним буфером на випадок
 * офлайну. `save` стабілізується через ref, щоб перерендери батька не збивали
 * debounce-таймер у `useRecordAutosave`.
 *
 * Використання: у режимі редагування рядка змонтувати дочірній компонент, який
 * викликає цей хук з `initial` = дані рядка. При зміні поля — `setField`.
 */
export interface UseInlineRecordEditResult<T> {
  fields: T;
  setField: <K extends keyof T>(key: K, value: T[K]) => void;
  status: DocAutosaveStatus;
  savedAt: Date | null;
  /** Чи є непорожній локальний буфер (незбережений прогрес з минулого сеансу). */
  hasRestore: boolean;
  /** Застосувати буфер до полів. */
  applyRestore: () => void;
  /** Відхилити буфер (стерти). */
  dismissRestore: () => void;
  /** Негайно дописати відкладений autosave (напр. при закритті редактора). */
  flush: () => Promise<void>;
}

export function useInlineRecordEdit<T extends Record<string, unknown>>(opts: {
  recordKey: string;
  initial: T;
  save: (data: T) => Promise<void>;
  enabled?: boolean;
  debounceMs?: number;
}): UseInlineRecordEditResult<T> {
  const [fields, setFields] = useState<T>(opts.initial);

  // Стабільний `save` — інакше зміна identity при кожному рендері перезапускає
  // debounce-таймер.
  const saveRef = useRef(opts.save);
  saveRef.current = opts.save;
  const stableSave = useCallback((data: T) => saveRef.current(data), []);

  const autosave = useRecordAutosave<T>({
    recordKey: opts.recordKey,
    data: fields,
    enabled: opts.enabled ?? true,
    save: stableSave,
    debounceMs: opts.debounceMs,
  });

  const setField = useCallback(
    <K extends keyof T>(key: K, value: T[K]) =>
      setFields((f) => ({ ...f, [key]: value })),
    [],
  );

  const restoreData = autosave.restoreData;
  const acceptRestore = autosave.acceptRestore;
  const applyRestore = useCallback(() => {
    if (restoreData) setFields(restoreData);
    acceptRestore();
  }, [restoreData, acceptRestore]);

  return {
    fields,
    setField,
    status: autosave.status,
    savedAt: autosave.savedAt,
    hasRestore: autosave.restoreData !== null,
    applyRestore,
    dismissRestore: autosave.dismissRestore,
    flush: autosave.flushNow,
  };
}
