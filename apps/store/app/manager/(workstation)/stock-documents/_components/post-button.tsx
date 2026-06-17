"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Кнопка проведення документа (draft → posted). */
export function StockDocPostButton({ kind, id }: { kind: string; id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handlePost() {
    if (!confirm("Провести документ?")) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/v1/manager/stock-documents/${kind}/${id}/post`,
        { method: "POST" },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? `HTTP ${res.status}`);
        setBusy(false);
        return;
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Помилка");
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={busy}
        onClick={handlePost}
        className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
      >
        ✅ Провести
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
