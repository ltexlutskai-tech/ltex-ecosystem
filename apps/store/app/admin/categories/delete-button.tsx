"use client";

import { ConfirmDelete } from "@/components/admin/confirm-delete";
import { deleteCategory } from "./actions";

export function DeleteCategoryButton({
  categoryId,
  categoryName,
}: {
  categoryId: string;
  categoryName: string;
}) {
  return (
    <ConfirmDelete
      title="Видалити категорію?"
      description={`Категорію "${categoryName}" буде видалено. Ця дія незворотня.`}
      action={() => deleteCategory(categoryId)}
      trigger={
        <button type="button" className="text-sm text-red-500 hover:underline">
          Видалити
        </button>
      }
    />
  );
}
