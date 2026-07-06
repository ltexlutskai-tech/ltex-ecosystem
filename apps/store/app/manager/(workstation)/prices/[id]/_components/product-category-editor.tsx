"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { changeProductCategory } from "../category-actions";
import {
  CategoryCascader,
  type CascaderNode,
} from "../../../_components/category-cascader";

/**
 * Зміна категорії товару з картки (7.2) — лише ролям каталогу. Каскадний вибір
 * рівень за рівнем (Тип → Сезон → Категорія → Підкатегорія).
 */
export function ProductCategoryEditor({
  productId,
  currentCategoryId,
  categories,
}: {
  productId: string;
  currentCategoryId: string | null;
  categories: CascaderNode[];
}) {
  const router = useRouter();
  const [value, setValue] = useState(currentCategoryId ?? "");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const dirty = value !== (currentCategoryId ?? "");

  function save() {
    if (!dirty || !value) return;
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
      <CategoryCascader
        nodes={categories}
        name="categoryId"
        initialId={currentCategoryId}
        onChange={(id) => {
          setValue(id);
          setSaved(false);
        }}
      />
      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={save}
          disabled={pending || !dirty || !value}
          className="rounded-md bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
        >
          {pending ? "Збереження…" : "Зберегти категорію"}
        </button>
        {error && <span className="text-xs text-red-600">{error}</span>}
        {saved && !dirty && (
          <span className="text-xs text-green-700">Категорію змінено.</span>
        )}
      </div>
    </section>
  );
}
