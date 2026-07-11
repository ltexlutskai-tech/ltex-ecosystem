"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  clearLocalDraft,
  localDraftKey,
  readLocalDraft,
  writeLocalDraft,
} from "./local-draft";

/**
 * Рівень 2 автозбереження — жива чернетка документа в БД (дворівнево з localStorage).
 *
 * Модель localStorage як «буфер несинхронізованого»: на кожну зміну пишемо в
 * localStorage негайно; після УСПІШНОГО запису в БД — буфер чистимо (джерело
 * правди тепер БД). Тож непорожній буфер при відкритті = був незбережений прогрес
 * (сервер/вкладка впали до синхронізації) → пропонуємо «Відновити».
 *
 * Debounce ~2 с тиші + flush на `visibilitychange`(hidden). Для нового документа
 * перший запис створює draft-рядок (POST) → id → `onIdAssigned` (URL → /[id]).
 * Наступні — PATCH. Заблоковані документи (`enabled=false`) не чіпаються.
 */

export type DocAutosaveStatus =
  | "idle"
  | "saving"
  | "saved"
  | "offline"
  | "error";

export interface UseDocumentAutosaveOptions<T> {
  /** Тип документа — ключ localStorage (`ltex:draft:<docType>:<id|"new">`). */
  docType: string;
  /** id наявного документа; undefined/null для нового. */
  existingId?: string | null;
  /** Серіалізований стан форми (має бути JSON-safe). */
  data: T;
  /** Чи автозбереження активне (false для posted/archived/completed). */
  enabled?: boolean;
  /** Створити чернетку (POST) → повертає новий id. */
  createDraft: (data: T) => Promise<string>;
  /** Оновити чернетку (PATCH). */
  updateDraft: (id: string, data: T) => Promise<void>;
  /** Викликається один раз, коли новому документу присвоєно id (URL → /[id]). */
  onIdAssigned?: (id: string) => void;
  /**
   * Гейт створення draft-рядка (лише для НОВОГО документа, доки немає id).
   * `false` → серверний запис пропускається (рівень 1/localStorage все одно
   * буферизує), доки не з'являться обов'язкові поля (напр. `Sale.customerId` —
   * обов'язковий FK). Для оновлення наявної чернетки не діє. Дефолт `true`.
   */
  canCreateDraft?: boolean;
  /** Debounce запису в БД, мс (дефолт 2000). */
  serverDebounceMs?: number;
  /**
   * Чи пропонувати відновлення з localStorage-буфера (банер «Знайдено
   * незбережені зміни»). `false` → банер не показується (документи-чернетки й
   * так зберігаються у БД і доступні у списку). Дефолт `true`.
   */
  enableRestore?: boolean;
}

export interface UseDocumentAutosaveResult<T> {
  status: DocAutosaveStatus;
  savedAt: Date | null;
  draftId: string | null;
  /** Дані з буфера localStorage для відновлення (null якщо немає). */
  restoreData: T | null;
  /** Прибрати банер відновлення (свідома відмова — чистить буфер). */
  dismissRestore: () => void;
  /** Позначити, що дані застосовано з буфера (ховає банер, лишає буфер до наступного save). */
  acceptRestore: () => void;
  /** Негайний запис (напр. перед ручним «Провести»). */
  flushNow: () => Promise<void>;
  /** Повне очищення (після успішного проведення). */
  clearAll: () => void;
}

const isSerializable = (v: unknown): boolean => {
  try {
    JSON.stringify(v);
    return true;
  } catch {
    return false;
  }
};

export function useDocumentAutosave<T>(
  opts: UseDocumentAutosaveOptions<T>,
): UseDocumentAutosaveResult<T> {
  const {
    docType,
    existingId,
    data,
    enabled = true,
    createDraft,
    updateDraft,
    onIdAssigned,
    canCreateDraft = true,
    serverDebounceMs = 2000,
    enableRestore = true,
  } = opts;

  const [status, setStatus] = useState<DocAutosaveStatus>("idle");
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [draftId, setDraftId] = useState<string | null>(existingId ?? null);
  const [restoreData, setRestoreData] = useState<T | null>(null);

  // localStorage key — стабільний на час життя форми (new або конкретний id).
  const keyRef = useRef(localDraftKey(docType, existingId ?? null));

  const draftIdRef = useRef<string | null>(existingId ?? null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const creatingRef = useRef<Promise<string> | null>(null);
  // Знімок останнього успішно збереженого стану (щоб не слати без змін).
  const lastSavedSnapRef = useRef<string>(JSON.stringify(data));
  const dataRef = useRef<T>(data);
  const mountedRef = useRef(false);

  dataRef.current = data;

  // ── Mount: перевірка буфера localStorage (незбережене з минулого разу) ──
  useEffect(() => {
    if (!enabled) return;
    // Банер відновлення вимкнено (enableRestore=false) — чистимо буфер, щоб
    // старі дані не накопичувались, і не пропонуємо відновлення.
    if (!enableRestore) {
      clearLocalDraft(keyRef.current);
      mountedRef.current = true;
      return;
    }
    const env = readLocalDraft<T>(keyRef.current);
    if (env && env.data != null) {
      setRestoreData(env.data);
    }
    mountedRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const doServerSave = useCallback(async (): Promise<void> => {
    const snapshot = dataRef.current;
    const snapStr = JSON.stringify(snapshot);
    if (snapStr === lastSavedSnapRef.current) return; // без змін
    // Новий документ без обов'язкових полів (гейт) — серверний запис відкладено;
    // рівень 1 (localStorage) уже збережений у change-ефекті. Статус не чіпаємо.
    if (!draftIdRef.current && !canCreateDraft) return;
    setStatus("saving");
    try {
      let id = draftIdRef.current;
      if (!id) {
        // Створюємо draft лише один раз (лок від паралельних тригерів).
        if (!creatingRef.current) {
          creatingRef.current = createDraft(snapshot);
        }
        id = await creatingRef.current;
        creatingRef.current = null;
        draftIdRef.current = id;
        setDraftId(id);
        onIdAssigned?.(id);
      } else {
        await updateDraft(id, snapshot);
      }
      lastSavedSnapRef.current = snapStr;
      clearLocalDraft(keyRef.current); // синхронізовано → буфер більше не потрібен
      setSavedAt(new Date());
      setStatus("saved");
    } catch {
      creatingRef.current = null;
      // Не вдалось (офлайн/сервер) — дані лишаються в localStorage-буфері.
      setStatus("offline");
    }
  }, [createDraft, updateDraft, onIdAssigned, canCreateDraft]);

  // ── Реакція на зміну data: буфер localStorage + дебаунс-запис у БД ──
  useEffect(() => {
    if (!enabled || !mountedRef.current) return;
    if (!isSerializable(data)) return;
    const snapStr = JSON.stringify(data);
    if (snapStr === lastSavedSnapRef.current) return; // нічого не змінилось

    // Рівень 1 — негайний локальний буфер.
    writeLocalDraft(keyRef.current, data, new Date().toISOString());

    // Рівень 2 — дебаунс-запис у БД.
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      void doServerSave();
    }, serverDebounceMs);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [data, enabled, serverDebounceMs, doServerSave]);

  // ── Flush при згортанні вкладки / переході у фон ──
  useEffect(() => {
    if (!enabled) return;
    const onHide = () => {
      if (document.visibilityState === "hidden") {
        if (timerRef.current) clearTimeout(timerRef.current);
        void doServerSave();
      }
    };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, [enabled, doServerSave]);

  const flushNow = useCallback(async () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    await doServerSave();
  }, [doServerSave]);

  const clearAll = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    clearLocalDraft(keyRef.current);
    lastSavedSnapRef.current = JSON.stringify(dataRef.current);
  }, []);

  const dismissRestore = useCallback(() => {
    clearLocalDraft(keyRef.current);
    setRestoreData(null);
  }, []);

  const acceptRestore = useCallback(() => {
    setRestoreData(null);
  }, []);

  return {
    status,
    savedAt,
    draftId,
    restoreData,
    dismissRestore,
    acceptRestore,
    flushNow,
    clearAll,
  };
}
