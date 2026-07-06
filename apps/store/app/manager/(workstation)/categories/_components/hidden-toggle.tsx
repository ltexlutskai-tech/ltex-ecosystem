"use client";

import { useState, useTransition } from "react";
import { Eye, EyeOff } from "lucide-react";
import { setCategoryHidden } from "../actions";

/**
 * Перемикач «приховати з сайту/агентів» для категорії (7.2). При увімкненні
 * товари цієї категорії та її піддерева зникають із сайту й прайсу.
 */
export function HiddenToggle({
  categoryId,
  hidden,
}: {
  categoryId: string;
  hidden: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function toggle() {
    setError(null);
    startTransition(async () => {
      try {
        await setCategoryHidden(categoryId, !hidden);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Помилка");
      }
    });
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      {error && <span className="text-xs text-red-600">{error}</span>}
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        title={hidden ? "Прихована — показати" : "Показується — приховати"}
        className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium disabled:opacity-50 ${
          hidden
            ? "border-amber-300 bg-amber-50 text-amber-700"
            : "border-gray-200 text-gray-600 hover:bg-gray-50"
        }`}
      >
        {hidden ? (
          <>
            <EyeOff className="h-3.5 w-3.5" /> Прихована
          </>
        ) : (
          <>
            <Eye className="h-3.5 w-3.5" /> Видима
          </>
        )}
      </button>
    </span>
  );
}
