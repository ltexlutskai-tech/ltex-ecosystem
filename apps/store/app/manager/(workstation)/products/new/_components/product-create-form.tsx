"use client";

import { useActionState } from "react";
import { Button, Input } from "@ltex/ui";
import {
  QUALITY_LEVELS,
  QUALITY_LABELS,
  COUNTRIES,
  COUNTRY_LABELS,
} from "@ltex/shared";
import { createManagerProduct, type CreateProductState } from "../actions";
import {
  CategoryCascader,
  type CascaderNode,
} from "../../../_components/category-cascader";

const inputCls =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm";

export function ProductCreateForm({
  categories,
}: {
  categories: CascaderNode[];
}) {
  const [state, formAction, pending] = useActionState<
    CreateProductState,
    FormData
  >(createManagerProduct, {});

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium">Назва *</label>
          <Input name="name" required placeholder="Напр. Куртки мікс зима" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Артикул *</label>
          <Input name="articleCode" required placeholder="Напр. 1235" />
        </div>
        <div className="sm:col-span-2">
          <label className="mb-1 block text-sm font-medium">Категорія *</label>
          <CategoryCascader nodes={categories} name="categoryId" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Одиниця *</label>
          <select name="priceUnit" defaultValue="kg" className={inputCls}>
            <option value="kg">за кг</option>
            <option value="piece">за шт/пару</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Ціна, € *</label>
          <Input
            name="price"
            type="number"
            step="0.01"
            min="0"
            required
            placeholder="0.00"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Якість *</label>
          <select name="quality" required defaultValue="" className={inputCls}>
            <option value="" disabled>
              Оберіть якість…
            </option>
            {QUALITY_LEVELS.map((q) => (
              <option key={q} value={q}>
                {QUALITY_LABELS[q]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Країна *</label>
          <select name="country" required defaultValue="" className={inputCls}>
            <option value="" disabled>
              Оберіть країну…
            </option>
            {COUNTRIES.map((c) => (
              <option key={c} value={c}>
                {COUNTRY_LABELS[c]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Стать *</label>
          <Input
            name="gender"
            required
            placeholder="Чоловіча / Жіноча / Дитяча"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Розміри *</label>
          <Input name="sizes" required placeholder="Напр. S–XXL" />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium">Опис *</label>
        <textarea
          name="description"
          required
          rows={3}
          className={inputCls}
          placeholder="Короткий опис товару"
        />
      </div>

      {state?.error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">
          {state.error}
        </p>
      )}

      <Button type="submit" disabled={pending}>
        {pending ? "Створення…" : "Створити товар"}
      </Button>
      <p className="text-xs text-gray-400">
        Після створення відкриється картка товару — там можна додати фото.
      </p>
    </form>
  );
}
