"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

/**
 * Кнопка «Назад» на крок назад (історія браузера) — повертає туди, звідки
 * прийшли (напр. на вкладку Реалізації/Замовлення маршрутного листа), а не на
 * фіксовану сторінку. `fallbackHref` — куди піти, якщо історії немає.
 */
export function BackButton({
  label = "Назад",
  fallbackHref,
  className,
}: {
  label?: string;
  fallbackHref?: string;
  className?: string;
}) {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => {
        if (typeof window !== "undefined" && window.history.length > 1) {
          router.back();
        } else if (fallbackHref) {
          router.push(fallbackHref);
        }
      }}
      className={
        className ??
        "inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900"
      }
    >
      <ArrowLeft className="h-4 w-4" />
      {label}
    </button>
  );
}
