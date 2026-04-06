"use client";

import { Button } from "@ltex/ui";
import Link from "next/link";

export default function StoreError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="container mx-auto flex flex-col items-center px-4 py-16 text-center">
      <h2 className="text-2xl font-bold">Виникла помилка</h2>
      <p className="mt-2 text-gray-500">
        {error.message || "Щось пішло не так. Спробуйте пізніше."}
      </p>
      <div className="mt-6 flex gap-3">
        <Button onClick={reset}>Спробувати знову</Button>
        <Button variant="outline" asChild>
          <Link href="/">На головну</Link>
        </Button>
      </div>
    </div>
  );
}
