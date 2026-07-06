"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { changeProductCategory } from "../category-actions";

interface CategoryOption {
  id: string;
  label: string;
}

/**
 * Зміна категорії товару з картки (7.2) — лише ролям каталогу. Показ товару на
 * сайті/агентам залежить від того, чи (під)категорія прихована.
 */
export function ProductCategoryEditor({
  productId,
  currentCategoryId,
  categories,
}: {
  productId: string;
  currentCategoryId: string | null;
  categories: CategoryOption[];
}) {
  const router = useRouter();
  const [value, setValue] = useState(currentCategoryId ?? "");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const dirty = value !== (currentCategoryId ?? "");

  function save() {
    if (!dirty) return;
    setError(null);
    setSaved(false);
    startTransition(async () => {
      try {
        await changeProductCategory(productId, value);
        setSaved(true);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Помилка");
      }
    });
  }

  return (
    <section className="rounded-lg border bg-white p-4">
      <h2 className="mb-2 text-sm font-bold text-gray-800">Категорія</h2>
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setSaved(false);
          }}
          className="min-w-[260px] flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          <option value="" disabled>
            Оберіть категорію…
          </option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={save}
          disabled={pending || !dirty}
          className="rounded-md bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
        >
          {pending ? "Збереження…" : "Зберегти"}
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      {saved && !dirty && (
        <p className="mt-2 text-xs text-green-700">Категорію змінено.</p>
      )}
    </section>
  );
}
