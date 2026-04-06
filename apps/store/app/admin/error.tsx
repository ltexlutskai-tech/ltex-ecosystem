"use client";

import { Button } from "@ltex/ui";

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16">
      <h2 className="text-xl font-bold text-red-600">Помилка</h2>
      <p className="mt-2 text-sm text-gray-500">
        {error.message || "Щось пішло не так"}
      </p>
      <Button onClick={reset} className="mt-4">
        Спробувати знову
      </Button>
    </div>
  );
}
