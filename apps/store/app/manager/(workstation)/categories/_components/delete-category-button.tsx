"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { deleteManagerCategory } from "../actions";

export function DeleteCategoryButton({
  categoryId,
  categoryName,
}: {
  categoryId: string;
  categoryName: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onDelete() {
    if (!window.confirm(`Видалити категорію «${categoryName}»?`)) return;
    setError(null);
    startTransition(async () => {
      try {
        await deleteManagerCategory(categoryId);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Помилка видалення");
      }
    });
  }

  return (
    <span className="inline-flex items-center gap-2">
      {error && <span className="text-xs text-red-600">{error}</span>}
      <button
        type="button"
        onClick={onDelete}
        disabled={pending}
        className="text-gray-400 hover:text-red-600 disabled:opacity-50"
        aria-label="Видалити категорію"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </span>
  );
}
