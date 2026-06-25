/**
 * Скелет завантаження для важких звітів (гнучкі звіти можуть рахуватися кілька
 * секунд). Показується під час серверного рендеру сторінки звіту, щоб користувач
 * бачив прогрес, а не порожній екран («чи це глюк, чи вантажиться»).
 */
export default function ReportsLoading() {
  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-emerald-600" />
        Формування звіту…
      </div>
      <div className="h-10 animate-pulse rounded-md bg-gray-100" />
      <div className="space-y-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-8 animate-pulse rounded bg-gray-100" />
        ))}
      </div>
    </div>
  );
}
