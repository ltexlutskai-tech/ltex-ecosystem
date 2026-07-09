"use client";

import { useState } from "react";

/**
 * Секція налаштувань: допуск різниці ваги при перепаковці (кг). Редагують
 * лише склад/адмін/власник — інші бачать значення read-only.
 */
export function RepackToleranceSection({
  initial,
  canEdit,
}: {
  initial: number;
  canEdit: boolean;
}) {
  const [value, setValue] = useState(String(initial));
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/v1/manager/settings/repack-tolerance", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toleranceKg: Number(value) || 0 }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? `HTTP ${res.status}`);
      } else {
        setSaved(true);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Помилка");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-lg border bg-white p-4">
      <h2 className="text-sm font-semibold text-gray-700">Перепаковка</h2>
      <p className="mt-1 text-xs text-gray-500">
        Допуск різниці ваги «розібрали − зібрали» (кг). Якщо різниця більша —
        при проведенні перепаковки показується попередження.
      </p>
      <div className="mt-3 flex items-center gap-2">
        <input
          type="number"
          step="0.1"
          min="0"
          value={value}
          disabled={!canEdit || busy}
          onChange={(e) => {
            setValue(e.target.value);
            setSaved(false);
          }}
          className="w-28 rounded-md border border-gray-300 px-2 py-1.5 text-sm disabled:bg-gray-50"
        />
        <span className="text-sm text-gray-500">кг</span>
        {canEdit && (
          <button
            type="button"
            onClick={save}
            disabled={busy}
            className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            Зберегти
          </button>
        )}
        {saved && <span className="text-xs text-emerald-600">Збережено</span>}
        {error && <span className="text-xs text-red-600">{error}</span>}
      </div>
    </section>
  );
}
