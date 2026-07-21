"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input } from "@ltex/ui";
import type { ProductAttributeOptions } from "@/lib/manager/product-attributes";
import type { ProductEditFields } from "../../_lib/load-product";
import {
  updateProductCharacteristics,
  type CharacteristicsState,
} from "../characteristics-actions";

const inputCls =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm";

interface KeyFact {
  label: string;
  value: string;
}

/**
 * Характеристики товару на картці (2026-07-17). За замовчуванням — лише
 * ПЕРЕГЛЯД (менеджери просто бачать інформацію). Ролі, що мають право (усі,
 * крім торгових менеджерів), бачать кнопку «Редагувати» → форма з тими самими
 * полями, що у створенні товару (крім ціни/категорії/середньої ваги).
 */
export function ProductCharacteristicsEditor({
  productId,
  canEdit,
  keyFacts,
  values,
  attributeOptions,
  producers,
}: {
  productId: string;
  canEdit: boolean;
  keyFacts: KeyFact[];
  values: ProductEditFields;
  attributeOptions: ProductAttributeOptions;
  producers: string[];
}) {
  const [editing, setEditing] = useState(false);

  if (!editing) {
    return (
      <div className="space-y-3">
        {keyFacts.length > 0 ? (
          <ul className="grid gap-1 text-sm text-gray-700 sm:grid-cols-2">
            {keyFacts.map((fact) => (
              <li key={fact.label} className="flex gap-2">
                <span className="text-emerald-600">✔</span>
                <span className="text-gray-500">{fact.label}:</span>
                <span className="font-medium text-gray-800">{fact.value}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-gray-400">Характеристики не заповнено.</p>
        )}
        {canEdit && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setEditing(true)}
          >
            ✎ Редагувати
          </Button>
        )}
      </div>
    );
  }

  return (
    <CharacteristicsForm
      productId={productId}
      values={values}
      attributeOptions={attributeOptions}
      producers={producers}
      onDone={() => setEditing(false)}
    />
  );
}

function CharacteristicsForm({
  productId,
  values,
  attributeOptions,
  producers,
  onDone,
}: {
  productId: string;
  values: ProductEditFields;
  attributeOptions: ProductAttributeOptions;
  producers: string[];
  onDone: () => void;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<
    CharacteristicsState,
    FormData
  >(updateProductCharacteristics, {});

  // Успішне збереження → оновити картку (нові значення) і вийти з режиму правки.
  useEffect(() => {
    if (state?.ok) {
      router.refresh();
      onDone();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.ok]);

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="productId" value={productId} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Сорт *">
          <select
            name="quality"
            required
            defaultValue={values.quality}
            className={inputCls}
          >
            <option value="" disabled>
              Оберіть якість…
            </option>
            {attributeOptions.quality.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Країна *">
          <select
            name="country"
            required
            defaultValue={values.country}
            className={inputCls}
          >
            <option value="" disabled>
              Оберіть країну…
            </option>
            {attributeOptions.countries.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Стать">
          <select
            name="gender"
            defaultValue={values.gender}
            className={inputCls}
          >
            <option value="">— не вказано —</option>
            {attributeOptions.genders.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Сезон">
          <select
            name="season"
            defaultValue={values.season}
            className={inputCls}
          >
            <option value="">— не вказано —</option>
            {attributeOptions.seasons.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Розміри">
          <Input name="sizes" defaultValue={values.sizes} placeholder="S–XXL" />
        </Field>
        <Field label="Кількість одиниць">
          <Input
            name="unitsPerKg"
            defaultValue={values.unitsPerKg}
            placeholder="Напр. 40 або 40–50"
          />
        </Field>
        <Field label="Вага одиниці, кг">
          <Input
            name="unitWeight"
            defaultValue={values.unitWeight}
            placeholder="Напр. 0.3 або 0.3–0.5"
          />
        </Field>
        <Field label="Виробник">
          <select
            name="producer"
            defaultValue={values.producer}
            className={inputCls}
          >
            <option value="">— не вказано —</option>
            {producers.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Посилання на YouTube" full>
          <Input
            name="videoUrl"
            defaultValue={values.videoUrl}
            placeholder="https://youtu.be/…"
          />
        </Field>
        <Field label="Назва для друку та інтеграції" full>
          <Input
            name="receiptName"
            defaultValue={values.receiptName}
            list="receipt-name-options"
            placeholder="Напр. Одяг вживаний"
          />
          <datalist id="receipt-name-options">
            <option value="Одяг вживаний" />
            <option value="Взуття вживане" />
            <option value="Товари для дому вживані" />
          </datalist>
          <p className="mt-1 text-xs text-gray-400">
            Узагальнена назва для чеків Checkbox і друкованих накладних. Порожнє
            — система визначить за категорією.
          </p>
        </Field>
        <Field label="Пакування">
          <select
            name="packaging"
            defaultValue={values.packaging}
            className={inputCls}
          >
            <option value="">— не вказано —</option>
            <option value="box">Коробка</option>
            <option value="bag">Мішок</option>
          </select>
          <p className="mt-1 text-xs text-gray-400">
            Мішки потребують ручної обробки на Новій Пошті.
          </p>
        </Field>
        <Field label="Наповнення" full>
          <textarea
            name="filling"
            defaultValue={values.filling}
            rows={2}
            className={inputCls}
            placeholder="Короткий перелік вмісту лота"
          />
        </Field>
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Збереження…" : "Зберегти"}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={onDone}>
          Скасувати
        </Button>
        {state?.error && (
          <span className="text-sm text-red-600">{state.error}</span>
        )}
      </div>
    </form>
  );
}

function Field({
  label,
  children,
  full,
}: {
  label: string;
  children: React.ReactNode;
  full?: boolean;
}) {
  return (
    <div className={full ? "sm:col-span-2" : undefined}>
      <label className="mb-1 block text-sm font-medium text-gray-700">
        {label}
      </label>
      {children}
    </div>
  );
}
