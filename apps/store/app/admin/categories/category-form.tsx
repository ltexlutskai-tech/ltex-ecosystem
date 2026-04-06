"use client";

import { Button, Input } from "@ltex/ui";
import { createCategory } from "./actions";
import type { Category } from "@ltex/db";

export function CategoryForm({ categories }: { categories: Category[] }) {
  return (
    <form action={createCategory} className="flex flex-col gap-3">
      <div>
        <label className="mb-1 block text-sm font-medium">Назва *</label>
        <Input name="name" required placeholder="Назва категорії" />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium">Slug *</label>
        <Input name="slug" required placeholder="nazva-kategorii" />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium">
          Батьківська категорія
        </label>
        <select
          name="parentId"
          defaultValue=""
          className="w-full rounded-md border px-3 py-2 text-sm"
        >
          <option value="">Коренева (без батька)</option>
          {categories
            .filter((c) => !c.parentId)
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
        </select>
      </div>
      <Button type="submit">Додати</Button>
    </form>
  );
}
