"use client";

import { Button, Input } from "@ltex/ui";
import { createManagerCategory } from "../actions";
import {
  CategoryCascader,
  type CascaderNode,
} from "../../_components/category-cascader";

export function CategoryForm({ nodes }: { nodes: CascaderNode[] }) {
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
        <label className="mb-1 block text-sm font-medium">
          Батьківська категорія
        </label>
        <CategoryCascader nodes={nodes} name="parentId" allowRoot />
      </div>
      <Button type="submit">Додати</Button>
    </form>
  );
}
