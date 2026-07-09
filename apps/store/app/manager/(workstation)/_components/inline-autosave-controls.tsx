"use client";

import { Check } from "lucide-react";
import type { DocAutosaveStatus } from "@/lib/autosave/use-document-autosave";
import { AutosaveStatus } from "./autosave-status";

/**
 * Компактні контролі inline-автозбереження рядка довідника/картки:
 * індикатор стану, кнопка «Готово» (закрити редактор — autosave вже відбувся),
 * і, якщо є незбережений буфер з минулого сеансу, — компактне «Відновити/Відхилити».
 *
 * Кнопки «Зберегти» немає навмисно — зміни зберігаються одразу (autosave).
 */
export function InlineAutosaveControls({
  status,
  savedAt,
  hasRestore,
  onApplyRestore,
  onDismissRestore,
  onDone,
  busy,
}: {
  status: DocAutosaveStatus;
  savedAt: Date | null;
  hasRestore: boolean;
  onApplyRestore: () => void;
  onDismissRestore: () => void;
  onDone: () => void;
  busy?: boolean;
}) {
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      {hasRestore && (
        <span className="inline-flex items-center gap-1 rounded border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs text-amber-800">
          Є незбережене:
          <button
            type="button"
            onClick={onApplyRestore}
            className="font-medium text-amber-800 underline hover:text-amber-900"
          >
            Відновити
          </button>
          <span className="text-amber-400">·</span>
          <button
            type="button"
            onClick={onDismissRestore}
            className="text-amber-700 hover:text-amber-900"
          >
            Відхилити
          </button>
        </span>
      )}
      <AutosaveStatus status={status} savedAt={savedAt} />
      <button
        type="button"
        onClick={onDone}
        disabled={busy}
        className="inline-flex items-center gap-1 rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-50"
        aria-label="Готово"
      >
        <Check className="h-3.5 w-3.5" /> Готово
      </button>
    </span>
  );
}
