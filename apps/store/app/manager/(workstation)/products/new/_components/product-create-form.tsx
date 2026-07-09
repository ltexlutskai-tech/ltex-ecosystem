"use client";

import { useActionState, useEffect, useRef, useState } from "react";
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
import { RestoreDraftBanner } from "../../../_components/autosave-status";
import {
  clearLocalDraft,
  localDraftKey,
  readLocalDraft,
  writeLocalDraft,
} from "@/lib/autosave/local-draft";

type ProductDraft = Record<string, string>;
const PRODUCT_DRAFT_KEY = localDraftKey("create-product", null);

const inputCls =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm";

const GENDERS = ["Чоловіча", "Жіноча", "Дитяча", "Унісекс", "Мікс"] as const;

export function ProductCreateForm({
  categories,
  producers,
}: {
  categories: CascaderNode[];
  producers: string[];
}) {
  const [state, formAction, pending] = useActionState<
    CreateProductState,
    FormData
  >(createManagerProduct, {});

  // Захист незбереженого вводу (localStorage). Форма uncontrolled (FormData),
  // тому буферимо серіалізовану FormData на кожну зміну; при поверненні —
  // пропонуємо відновити. Сам запис лишається кнопкою «Створити товар».
  const formRef = useRef<HTMLFormElement>(null);
  const bufferTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [restore, setRestore] = useState<ProductDraft | null>(null);
  // Ключ для CategoryCascader — бампаємо, щоб перемонтувати з відновленим initialId.
  const [cascaderKey, setCascaderKey] = useState(0);
  const [categoryInitialId, setCategoryInitialId] = useState<string | null>(
    null,
  );

  useEffect(() => {
    const env = readLocalDraft<ProductDraft>(PRODUCT_DRAFT_KEY);
    if (env && env.data && Object.values(env.data).some((v) => v)) {
      setRestore(env.data);
    }
  }, []);

  function serializeAndBuffer() {
    const el = formRef.current;
    if (!el) return;
    const fd = new FormData(el);
    const obj: ProductDraft = {};
    fd.forEach((value, key) => {
      if (typeof value === "string" && value !== "") obj[key] = value;
    });
    if (bufferTimer.current) clearTimeout(bufferTimer.current);
    bufferTimer.current = setTimeout(() => {
      if (Object.keys(obj).length > 0) {
        writeLocalDraft(PRODUCT_DRAFT_KEY, obj, new Date().toISOString());
      }
    }, 500);
  }

  function applyRestore(data: ProductDraft) {
    const el = formRef.current;
    if (el) {
      Object.entries(data).forEach(([key, value]) => {
        if (key === "categoryId") return; // окремо через CategoryCascader
        const field = el.elements.namedItem(key);
        if (
          field instanceof HTMLInputElement ||
          field instanceof HTMLSelectElement ||
          field instanceof HTMLTextAreaElement
        ) {
          field.value = value;
        }
      });
    }
    if (data.categoryId) {
      setCategoryInitialId(data.categoryId);
      setCascaderKey((k) => k + 1);
    }
    setRestore(null);
  }

  function dismissRestore() {
    clearLocalDraft(PRODUCT_DRAFT_KEY);
    setRestore(null);
  }

  return (
    <form
      ref={formRef}
      action={formAction}
      onInput={serializeAndBuffer}
      onSubmit={() => clearLocalDraft(PRODUCT_DRAFT_KEY)}
      className="space-y-4"
    >
      {restore && (
        <RestoreDraftBanner
          onRestore={() => applyRestore(restore)}
          onDismiss={dismissRestore}
        />
      )}

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
          <CategoryCascader
            key={cascaderKey}
            nodes={categories}
            name="categoryId"
            initialId={categoryInitialId}
          />
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
          <select name="gender" required defaultValue="" className={inputCls}>
            <option value="" disabled>
              Оберіть стать…
            </option>
            {GENDERS.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Розміри *</label>
          <Input name="sizes" required placeholder="Напр. S–XXL" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Виробник</label>
          <select name="producer" defaultValue="" className={inputCls}>
            <option value="">— не вказано —</option>
            {producers.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          {producers.length === 0 && (
            <p className="mt-1 text-xs text-gray-400">
              Список порожній — додайте виробників у Довідники → Виробники.
            </p>
          )}
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">
            Посилання на YouTube
          </label>
          <Input name="videoUrl" placeholder="https://youtu.be/…" />
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
        Код товару (формат 1С) і дата створення присвоюються автоматично. Після
        створення відкриється картка товару — там можна додати фото. Посилання
        на сторінку товару й лоти формуються автоматично.
      </p>
    </form>
  );
}
