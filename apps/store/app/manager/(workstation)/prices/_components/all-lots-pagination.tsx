"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Button } from "@ltex/ui";

export function AllLotsPagination({
  page,
  totalPages,
}: {
  page: number;
  totalPages: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function goTo(p: number) {
    const sp = new URLSearchParams(searchParams.toString());
    if (p <= 1) sp.delete("page");
    else sp.set("page", String(p));
    router.push(`${pathname}?${sp.toString()}`);
  }

  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-end gap-2 text-sm">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={page <= 1}
        onClick={() => goTo(page - 1)}
      >
        ‹ Назад
      </Button>
      <span className="px-2 text-gray-600">
        Сторінка {page} з {totalPages}
      </span>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={page >= totalPages}
        onClick={() => goTo(page + 1)}
      >
        Далі ›
      </Button>
    </div>
  );
}
