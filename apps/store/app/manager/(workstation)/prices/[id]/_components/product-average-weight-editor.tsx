"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateProductAverageWeight } from "../average-weight-actions";

/**
 * Редактор характеристики «Середня вага» товару (кг на мішок). Цю вагу система
 * підставляє у замовлення/реалізацію для розрахунку (замість дефолтних 20 кг).
 * Порожнє поле → очистити (знову діятиме дефолт 20 кг). Лише ролі каталогу.
 */
export function ProductAverageWeightEditor({
  productId,
  currentValue,
}: {
  productId: string;
  currentValue: number | null;
}) {
  const router = useRouter();
  const [value, setValue] = useState(
    currentValue != null ? String(currentValue) : "",
  );
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const initial = currentValue != null ? String(currentValue) : "";
  const dirty = value.trim() !== initial;

  function save() {
    if (!dirty) return;
    setError(null);
    setSaved(false);
    const trimmed = value.trim().replace(",", ".");
    const parsed = trimmed === "" ? null : Number.parseFloat(trimmed);
    if (parsed !== null && (!Number.isFinite(parsed) || parsed <= 0)) {
      setError("Вкажіть коректну вагу (> 0) або залиште порожнім");
      return;
    }
    startTransition(async () => {
      try {
        await updateProductAverageWeight(productId, parsed);
        setSaved(true);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Помилка");
      }
    });
  }

  return (
    <section className="rounded-lg border bg-white p-4">
      <h2 className="mb-1 text-sm font-bold text-gray-800">Середня вага</h2>
      <p className="mb-3 text-xs text-gray-500">
        Вага одного мішка (кг). Підставляється у замовлення та реалізацію для
        розрахунку. Якщо порожньо — використовується 20 кг за замовчуванням.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <input
            type="number"
            min="0"
            step="0.1"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setSaved(false);
            }}
            placeholder="напр. 18.5"
            className="h-10 w-40 rounded-md border border-gray-300 bg-white px-3 pr-9 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
          />
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">
            кг
          </span>
        </div>
        <button
          type="button"
          onClick={save}
          disabled={pending || !dirty}
          className="rounded-md bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
        >
          {pending ? "Збереження…" : "Зберегти"}
        </button>
        {error && <span className="text-xs text-red-600">{error}</span>}
        {saved && !dirty && (
          <span className="text-xs text-green-700">Збережено.</span>
        )}
      </div>
    </section>
  );
}
