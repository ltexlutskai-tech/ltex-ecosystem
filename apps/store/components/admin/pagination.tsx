import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface AdminPaginationProps {
  page: number;
  totalPages: number;
  total: number;
  baseHref: string;
  buildHref: (page: number) => string;
}

export function AdminPagination({
  page,
  totalPages,
  total,
  buildHref,
}: AdminPaginationProps) {
  if (totalPages <= 1) return null;

  // Show max 7 page buttons around current page
  const pages: number[] = [];
  const start = Math.max(1, page - 3);
  const end = Math.min(totalPages, page + 3);
  for (let i = start; i <= end; i++) pages.push(i);

  return (
    <div className="flex items-center justify-between">
      <p className="text-sm text-gray-500">
        Сторінка {page} з {totalPages} ({total} записів)
      </p>
      <div className="flex items-center gap-1">
        {page > 1 && (
          <Link
            href={buildHref(page - 1)}
            className="inline-flex items-center rounded-md border px-2 py-1 text-sm hover:bg-gray-50"
          >
            <ChevronLeft className="h-4 w-4" />
            Назад
          </Link>
        )}
        {start > 1 && (
          <>
            <Link
              href={buildHref(1)}
              className="rounded-md border px-3 py-1 text-sm hover:bg-gray-50"
            >
              1
            </Link>
            {start > 2 && <span className="px-1 text-gray-400">...</span>}
          </>
        )}
        {pages.map((p) => (
          <Link
            key={p}
            href={buildHref(p)}
            className={`rounded-md border px-3 py-1 text-sm ${p === page ? "border-green-200 bg-green-50 text-green-700" : "hover:bg-gray-50"}`}
          >
            {p}
          </Link>
        ))}
        {end < totalPages && (
          <>
            {end < totalPages - 1 && (
              <span className="px-1 text-gray-400">...</span>
            )}
            <Link
              href={buildHref(totalPages)}
              className="rounded-md border px-3 py-1 text-sm hover:bg-gray-50"
            >
              {totalPages}
            </Link>
          </>
        )}
        {page < totalPages && (
          <Link
            href={buildHref(page + 1)}
            className="inline-flex items-center rounded-md border px-2 py-1 text-sm hover:bg-gray-50"
          >
            Далі
            <ChevronRight className="h-4 w-4" />
          </Link>
        )}
      </div>
    </div>
  );
}
