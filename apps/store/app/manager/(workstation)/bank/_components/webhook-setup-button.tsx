"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@ltex/ui";

/**
 * «Підключити Monobank» — реєструє наш webhook у банку і одразу тягне
 * рахунки/залишки (client-info). Показує inline-результат (toast в iframe
 * вкладок може губитись — тому текст під кнопкою).
 */
export function WebhookSetupButton({ label }: { label?: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  async function run() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/v1/manager/bank-feed/webhook-setup", {
        method: "POST",
      });
      const body = (await res.json().catch(() => null)) as {
        ok?: boolean;
        accounts?: number;
        error?: string;
        accountsError?: string;
      } | null;
      if (!res.ok || !body?.ok) {
        setIsError(true);
        setMessage(body?.error ?? `Помилка ${res.status}`);
        return;
      }
      setIsError(false);
      setMessage(
        body.accountsError
          ? `Вебхук зареєстровано, але рахунки не прочитались: ${body.accountsError}`
          : `Готово: вебхук активний, знайдено рахунків — ${body.accounts ?? 0}.`,
      );
      startTransition(() => router.refresh());
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <Button
        type="button"
        size="sm"
        onClick={() => void run()}
        disabled={busy || isPending}
      >
        {busy ? "Підключаємо…" : (label ?? "🔗 Підключити Monobank")}
      </Button>
      {message ? (
        <p
          className={`mt-1.5 text-xs ${isError ? "text-red-600" : "text-emerald-700"}`}
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}
