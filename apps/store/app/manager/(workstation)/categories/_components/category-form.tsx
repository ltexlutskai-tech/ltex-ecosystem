"use client";

import { Button, Input } from "@ltex/ui";
import { createManagerCategory } from "../actions";

interface ParentOption {
  id: string;
  name: string;
}

export function CategoryForm({ parents }: { parents: ParentOption[] }) {
  return (
    <form action={createManagerCategory} className="flex flex-col gap-3">
      <div>
        <label htmlFor="cat-name" className="mb-1 block text-sm font-medium">
          Назва *
        </label>
        <Input
          id="cat-name"
          name="name"
          required
          placeholder="Назва категорії"
        />
      </div>
      <div>
        <label htmlFor="cat-slug" className="mb-1 block text-sm font-medium">
          Slug *
        </label>
        <Input
          id="cat-slug"
          name="slug"
          required
          placeholder="nazva-kategorii"
        />
      </div>
      <div>
        <label htmlFor="cat-parent" className="mb-1 block text-sm font-medium">
          Батьківська категорія
        </label>
        <select
          id="cat-parent"
          name="parentId"
          defaultValue=""
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          <option value="">Коренева (без батька)</option>
          {parents.map((c) => (
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
