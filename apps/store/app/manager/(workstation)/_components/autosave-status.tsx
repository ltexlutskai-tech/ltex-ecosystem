"use client";

import type { DocAutosaveStatus } from "@/lib/autosave/use-document-autosave";

/**
 * Спільний індикатор автозбереження. Показує стан на кожній формі/картці:
 *  • saving  — «Збереження…»
 *  • saved   — «Збережено о HH:MM:SS»
 *  • offline — «Немає зв'язку — локальна копія в безпеці» (буфер localStorage)
 *  • idle    — нічого (ще не було змін)
 */
export function AutosaveStatus({
  status,
  savedAt,
  className,
}: {
  status: DocAutosaveStatus;
  savedAt?: Date | null;
  className?: string;
}) {
  let text = "";
  let tone = "text-gray-400";
  if (status === "saving") {
    text = "Збереження…";
    tone = "text-gray-500";
  } else if (status === "saved") {
    text = savedAt
      ? `Збережено о ${savedAt.toLocaleTimeString("uk-UA")}`
      : "Збережено";
    tone = "text-emerald-600";
  } else if (status === "offline") {
    text = "Немає зв'язку — локальна копія в безпеці";
    tone = "text-amber-600";
  } else if (status === "error") {
    text = "Помилка збереження — локальна копія в безпеці";
    tone = "text-amber-600";
  }
  if (!text) return null;
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs ${tone} ${className ?? ""}`}
      aria-live="polite"
    >
      {status === "saving" && (
        <span className="h-2 w-2 animate-pulse rounded-full bg-current" />
      )}
      {status === "saved" && <span aria-hidden>✓</span>}
      {(status === "offline" || status === "error") && (
        <span aria-hidden>⚠</span>
      )}
      {text}
    </span>
  );
}

/**
 * Банер відновлення незбереженого прогресу (буфер localStorage непорожній при
 * відкритті). Портальний стиль не потрібен — це inline-банер над формою.
 */
export function RestoreDraftBanner({
  onRestore,
  onDismiss,
}: {
  onRestore: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
      <span>Знайдено незбережені зміни з минулого сеансу. Відновити їх?</span>
      <span className="flex gap-2">
        <button
          type="button"
          onClick={onRestore}
          className="rounded bg-amber-600 px-3 py-1 text-xs font-medium text-white hover:bg-amber-700"
        >
          Відновити
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="rounded border border-amber-400 px-3 py-1 text-xs text-amber-800 hover:bg-amber-100"
        >
          Відхилити
        </button>
      </span>
    </div>
  );
}
