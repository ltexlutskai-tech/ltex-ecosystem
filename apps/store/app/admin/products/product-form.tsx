"use client";

import { Button, Input } from "@ltex/ui";
import { QUALITY_LEVELS, QUALITY_LABELS } from "@ltex/shared";
import { SEASONS, SEASON_LABELS, PRICE_UNITS, PRICE_UNIT_LABELS } from "@ltex/shared";
import { COUNTRIES, COUNTRY_LABELS } from "@ltex/shared";
import { createProduct, updateProduct } from "./actions";
import type { Product, Category } from "@ltex/db";

interface ProductFormProps {
  product: Product | null;
  categories: Category[];
}

export function ProductForm({ product, categories }: ProductFormProps) {
  const action = product
    ? updateProduct.bind(null, product.id)
    : createProduct;

  return (
    <form action={action} className="max-w-2xl space-y-4 rounded-lg border bg-white p-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium">Назва *</label>
          <Input name="name" defaultValue={product?.name ?? ""} required />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Slug *</label>
          <Input name="slug" defaultValue={product?.slug ?? ""} required />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium">Артикул</label>
          <Input name="articleCode" defaultValue={product?.articleCode ?? ""} />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Код 1С</label>
          <Input name="code1C" defaultValue={product?.code1C ?? ""} />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium">Категорія *</label>
        <select
          name="categoryId"
          defaultValue={product?.categoryId ?? ""}
          required
          className="w-full rounded-md border px-3 py-2 text-sm"
        >
          <option value="">Виберіть...</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium">Опис</label>
        <textarea
          name="description"
          defaultValue={product?.description ?? ""}
          className="w-full rounded-md border px-3 py-2 text-sm"
          rows={3}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label className="mb-1 block text-sm font-medium">Якість *</label>
          <select
            name="quality"
            defaultValue={product?.quality ?? ""}
            required
            className="w-full rounded-md border px-3 py-2 text-sm"
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
          <label className="mb-1 block text-sm font-medium">Сезон</label>
          <select
            name="season"
            defaultValue={product?.season ?? ""}
            className="w-full rounded-md border px-3 py-2 text-sm"
          >
            {SEASONS.map((s) => (
              <option key={s} value={s}>
                {SEASON_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Країна *</label>
          <select
            name="country"
            defaultValue={product?.country ?? ""}
            required
            className="w-full rounded-md border px-3 py-2 text-sm"
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
          <label className="mb-1 block text-sm font-medium">Одиниця ціни</label>
          <select
            name="priceUnit"
            defaultValue={product?.priceUnit ?? "kg"}
            className="w-full rounded-md border px-3 py-2 text-sm"
          >
            {PRICE_UNITS.map((u) => (
              <option key={u} value={u}>
                {PRICE_UNIT_LABELS[u]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Середня вага (кг)</label>
          <Input
            name="averageWeight"
            type="number"
            step="0.01"
            defaultValue={product?.averageWeight ?? ""}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">YouTube URL</label>
          <Input name="videoUrl" defaultValue={product?.videoUrl ?? ""} />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          name="inStock"
          id="inStock"
          defaultChecked={product?.inStock ?? true}
        />
        <label htmlFor="inStock" className="text-sm">
          В наявності
        </label>
      </div>

      <div className="flex gap-2">
        <Button type="submit">
          {product ? "Зберегти" : "Створити"}
        </Button>
        <Button type="button" variant="outline" asChild>
          <a href="/admin/products">Скасувати</a>
        </Button>
      </div>
    </form>
  );
}
