"use client";

import { useActionState } from "react";
import { Button, Input } from "@ltex/ui";
import type { ProductAttributeOptions } from "@/lib/manager/product-attributes";
import type { ProductEditFields } from "../../_lib/load-product";
import {
  updateProductCharacteristics,
  type CharacteristicsState,
} from "../characteristics-actions";

const inputCls =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm";

/**
 * Редагування характеристик товару з картки (2026-07-17). Ті самі поля, що у
 * формі створення (крім ціни/категорії/середньої ваги) — щоб доповнювати старі
 * позиції. Рендериться лише для ролей каталогу; решта бачать read-only список.
 */
export function ProductCharacteristicsEditor({
  productId,
  values,
  attributeOptions,
  producers,
}: {
  productId: string;
  values: ProductEditFields;
  attributeOptions: ProductAttributeOptions;
  producers: string[];
}) {
  const [state, formAction, pending] = useActionState<
    CharacteristicsState,
    FormData
  >(updateProductCharacteristics, {});

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
          {pending ? "Збереження…" : "Зберегти характеристики"}
        </Button>
        {state?.ok && (
          <span className="text-sm text-emerald-600">Збережено ✓</span>
        )}
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
