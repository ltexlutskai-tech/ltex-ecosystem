"use client";

import { Button, Input, Textarea } from "@ltex/ui";
import { QUALITY_LEVELS, QUALITY_LABELS } from "@ltex/shared";
import {
  SEASONS,
  SEASON_LABELS,
  PRICE_UNITS,
  PRICE_UNIT_LABELS,
} from "@ltex/shared";
import { COUNTRIES, COUNTRY_LABELS } from "@ltex/shared";
import { createProduct, updateProduct } from "./actions";
import type { Product, Category } from "@ltex/db";

const selectClass =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

interface ProductFormProps {
  product: Product | null;
  categories: Category[];
}

/**
 * Розгортає категорії у порядку дерева (батько перед нащадками) з глибиною —
 * для ієрархічного select з відступами. Сироти трактуються як корені.
 */
function buildCategoryOptions(
  categories: Category[],
): { id: string; name: string; depth: number }[] {
  const ids = new Set(categories.map((c) => c.id));
  const byParent = new Map<string, Category[]>();
  for (const c of categories) {
    const key = c.parentId && ids.has(c.parentId) ? c.parentId : "__root__";
    const arr = byParent.get(key);
    if (arr) arr.push(c);
    else byParent.set(key, [c]);
  }
  for (const arr of byParent.values()) {
    arr.sort((a, b) => a.name.localeCompare(b.name, "uk"));
  }
  const out: { id: string; name: string; depth: number }[] = [];
  const visited = new Set<string>();
  const walk = (key: string, depth: number): void => {
    for (const c of byParent.get(key) ?? []) {
      if (visited.has(c.id)) continue;
      visited.add(c.id);
      out.push({ id: c.id, name: c.name, depth });
      walk(c.id, depth + 1);
    }
  };
  walk("__root__", 0);
  return out;
}

export function ProductForm({ product, categories }: ProductFormProps) {
  const action = product ? updateProduct.bind(null, product.id) : createProduct;
  const categoryOptions = buildCategoryOptions(categories);

  return (
    <form
      action={action}
      className="max-w-2xl space-y-4 rounded-lg border bg-white p-6"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="prod-name" className="mb-1 block text-sm font-medium">
            Назва *
          </label>
          <Input
            id="prod-name"
            name="name"
            defaultValue={product?.name ?? ""}
            required
          />
        </div>
        <div>
          <label htmlFor="prod-slug" className="mb-1 block text-sm font-medium">
            Slug *
          </label>
          <Input
            id="prod-slug"
            name="slug"
            defaultValue={product?.slug ?? ""}
            required
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label
            htmlFor="prod-article"
            className="mb-1 block text-sm font-medium"
          >
            Артикул
          </label>
          <Input
            id="prod-article"
            name="articleCode"
            defaultValue={product?.articleCode ?? ""}
          />
        </div>
        <div>
          <label
            htmlFor="prod-code1c"
            className="mb-1 block text-sm font-medium"
          >
            Код 1С
          </label>
          <Input
            id="prod-code1c"
            name="code1C"
            defaultValue={product?.code1C ?? ""}
          />
        </div>
      </div>

      <div>
        <label
          htmlFor="prod-category"
          className="mb-1 block text-sm font-medium"
        >
          Категорія *
        </label>
        <select
          id="prod-category"
          name="categoryId"
          defaultValue={product?.categoryId ?? ""}
          required
          className={selectClass}
        >
          <option value="">Виберіть...</option>
          {categoryOptions.map((c) => (
            <option key={c.id} value={c.id}>
              {c.depth > 0 ? `${"  ".repeat(c.depth)}` : ""}
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="prod-desc" className="mb-1 block text-sm font-medium">
          Опис
        </label>
        <Textarea
          id="prod-desc"
          name="description"
          defaultValue={product?.description ?? ""}
          rows={3}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label
            htmlFor="prod-quality"
            className="mb-1 block text-sm font-medium"
          >
            Якість *
          </label>
          <select
            id="prod-quality"
            name="quality"
            defaultValue={product?.quality ?? ""}
            required
            className={selectClass}
          >
            <option value="">Виберіть...</option>
            {QUALITY_LEVELS.map((q) => (
              <option key={q} value={q}>
                {QUALITY_LABELS[q]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label
            htmlFor="prod-season"
            className="mb-1 block text-sm font-medium"
          >
            Сезон
          </label>
          <select
            id="prod-season"
            name="season"
            defaultValue={product?.season ?? ""}
            className={selectClass}
          >
            {SEASONS.map((s) => (
              <option key={s} value={s}>
                {SEASON_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label
            htmlFor="prod-country"
            className="mb-1 block text-sm font-medium"
          >
            Країна *
          </label>
          <select
            id="prod-country"
            name="country"
            defaultValue={product?.country ?? ""}
            required
            className={selectClass}
          >
            <option value="">Виберіть...</option>
            {COUNTRIES.map((c) => (
              <option key={c} value={c}>
                {COUNTRY_LABELS[c]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label htmlFor="prod-unit" className="mb-1 block text-sm font-medium">
            Одиниця ціни
          </label>
          <select
            id="prod-unit"
            name="priceUnit"
            defaultValue={product?.priceUnit ?? "kg"}
            className={selectClass}
          >
            {PRICE_UNITS.map((u) => (
              <option key={u} value={u}>
                {PRICE_UNIT_LABELS[u]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label
            htmlFor="prod-weight"
            className="mb-1 block text-sm font-medium"
          >
            Середня вага (кг)
          </label>
          <Input
            id="prod-weight"
            name="averageWeight"
            type="number"
            step="0.01"
            defaultValue={product?.averageWeight ?? ""}
          />
        </div>
        <div>
          <label
            htmlFor="prod-video"
            className="mb-1 block text-sm font-medium"
          >
            YouTube URL
          </label>
          <Input
            id="prod-video"
            name="videoUrl"
            defaultValue={product?.videoUrl ?? ""}
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label
            htmlFor="prod-gender"
            className="mb-1 block text-sm font-medium"
          >
            Стать
          </label>
          <Input
            id="prod-gender"
            name="gender"
            defaultValue={product?.gender ?? ""}
            placeholder="Жіноча, чоловіча"
          />
        </div>
        <div>
          <label
            htmlFor="prod-sizes"
            className="mb-1 block text-sm font-medium"
          >
            Розміри
          </label>
          <Input
            id="prod-sizes"
            name="sizes"
            defaultValue={product?.sizes ?? ""}
            placeholder="XS – 2XL"
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label
            htmlFor="prod-units-per-kg"
            className="mb-1 block text-sm font-medium"
          >
            К-сть одиниць
          </label>
          <Input
            id="prod-units-per-kg"
            name="unitsPerKg"
            defaultValue={product?.unitsPerKg ?? ""}
            placeholder="3–4 шт/кг"
          />
        </div>
        <div>
          <label
            htmlFor="prod-unit-weight"
            className="mb-1 block text-sm font-medium"
          >
            Вага одиниці
          </label>
          <Input
            id="prod-unit-weight"
            name="unitWeight"
            defaultValue={product?.unitWeight ?? ""}
            placeholder="0,25–0,35 кг"
          />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          name="inStock"
          id="prod-instock"
          defaultChecked={product?.inStock ?? true}
        />
        <label htmlFor="prod-instock" className="text-sm">
          В наявності
        </label>
      </div>

      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          name="isOversize"
          id="prod-isoversize"
          defaultChecked={product?.isOversize ?? false}
        />
        <label htmlFor="prod-isoversize" className="text-sm">
          Великий розмір (XXL+)
          <span className="ml-1 text-xs text-gray-500">
            — товар з&apos;явиться у спеціальній підкатегорії
          </span>
        </label>
      </div>

      <div className="flex gap-2">
        <Button type="submit">{product ? "Зберегти" : "Створити"}</Button>
        <Button type="button" variant="outline" asChild>
          <a href="/admin/products">Скасувати</a>
        </Button>
      </div>
    </form>
  );
}
