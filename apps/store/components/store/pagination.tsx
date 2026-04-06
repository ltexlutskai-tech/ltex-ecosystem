import Link from "next/link";

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  baseHref: string;
}

export function Pagination({ currentPage, totalPages, baseHref }: PaginationProps) {
  if (totalPages <= 1) return null;

  const pages: number[] = [];
  const start = Math.max(1, currentPage - 2);
  const end = Math.min(totalPages, currentPage + 2);
  for (let i = start; i <= end; i++) pages.push(i);

  const separator = baseHref.includes("?") ? "&" : "?";

  return (
    <nav className="flex items-center justify-center gap-1" aria-label="Pagination">
      {currentPage > 1 && (
        <Link
          href={`${baseHref}${separator}page=${currentPage - 1}`}
          className="rounded-md border px-3 py-1 text-sm hover:bg-gray-50"
        >
          ←
        </Link>
      )}
      {start > 1 && (
        <>
          <Link
            href={`${baseHref}${separator}page=1`}
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
          href={`${baseHref}${separator}page=${p}`}
          className={`rounded-md border px-3 py-1 text-sm ${
            p === currentPage
              ? "border-green-200 bg-green-50 text-green-700"
              : "hover:bg-gray-50"
          }`}
        >
          {p}
        </Link>
      ))}
      {end < totalPages && (
        <>
          {end < totalPages - 1 && <span className="px-1 text-gray-400">...</span>}
          <Link
            href={`${baseHref}${separator}page=${totalPages}`}
            className="rounded-md border px-3 py-1 text-sm hover:bg-gray-50"
          >
            {totalPages}
          </Link>
        </>
      )}
      {currentPage < totalPages && (
        <Link
          href={`${baseHref}${separator}page=${currentPage + 1}`}
          className="rounded-md border px-3 py-1 text-sm hover:bg-gray-50"
        >
          →
        </Link>
      )}
    </nav>
  );
}
