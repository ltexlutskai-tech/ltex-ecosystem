"use client";

import { Button, Input } from "@ltex/ui";
import { createCategory } from "./actions";
import type { Category } from "@ltex/db";

export function CategoryForm({ categories }: { categories: Category[] }) {
  return (
    <form action={createCategory} className="flex flex-col gap-3">
      <div>
        <label htmlFor="cat-name" className="mb-1 block text-sm font-medium">
          Назва *
        </label>
        <Input id="cat-name" name="name" required placeholder="Назва категорії" />
      </div>
      <div>
        <label htmlFor="cat-slug" className="mb-1 block text-sm font-medium">
          Slug *
        </label>
        <Input id="cat-slug" name="slug" required placeholder="nazva-kategorii" />
      </div>
      <div>
        <label htmlFor="cat-parent" className="mb-1 block text-sm font-medium">
          Батьківська категорія
        </label>
        <select
          id="cat-parent"
          name="parentId"
          defaultValue=""
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
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
