"use client";

import { Button } from "@ltex/ui";
import Link from "next/link";
import { getDictionary } from "@/lib/i18n";

const dict = getDictionary();

export default function StoreError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="container mx-auto flex flex-col items-center px-4 py-16 text-center">
      <h2 className="text-2xl font-bold">{dict.errors.errorTitle}</h2>
      <p className="mt-2 text-gray-500">
        {error.message || dict.errors.errorDefault}
      </p>
      <div className="mt-6 flex gap-3">
        <Button onClick={reset}>{dict.errors.tryAgain}</Button>
        <Button variant="outline" asChild>
          <Link href="/">{dict.errors.toHome}</Link>
        </Button>
      </div>
    </div>
  );
}
