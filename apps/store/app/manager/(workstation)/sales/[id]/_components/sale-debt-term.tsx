"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const DEFAULT_TERM_DAYS = 14;

/**
 * Контроль «Днів до закриття (відстрочка боргу)» на документі реалізації.
 *
 * Працює навіть для проведених/архівних документів (борг живе на них) — пише
 * через окремий ендпоінт `PATCH /sales/[id]/debt-term`, який обходить posted-lock.
 *
 * Для наложок (cashOnDelivery=true) відстрочки немає — показуємо статичну
 * примітку, поле приховане.
 */
export function SaleDebtTerm({
  saleId,
  cashOnDelivery,
  initialDebtTermDays,
}: {
  saleId: string;
  cashOnDelivery: boolean;
  initialDebtTermDays: number | null;
}) {
  const router = useRouter();
  const [value, setValue] = useState<string>(
    initialDebtTermDays == null ? "" : String(initialDebtTermDays),
  );
  const [saved, setSaved] = useState<number | null>(initialDebtTermDays);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (cashOnDelivery) {
    return (
      <section className="rounded-lg border bg-white p-5">
        <h2 className="text-base font-semibold text-gray-800">
          Відстрочка боргу
        </h2>
        <p className="mt-2 text-sm text-amber-700">
          Наложка — без відстрочки. Залишок показується окремо як «Борг по
          наложці».
        </p>
      </section>
    );
  }

  const dirty =
    (value.trim() === "" ? null : Math.trunc(Number(value))) !== saved;

  async function save() {
    const trimmed = value.trim();
    let parsed: number | null;
    if (trimmed === "") {
      parsed = null;
    } else {
      const n = Number(trimmed);
      if (!Number.isFinite(n) || n < 0) {
        setError("Введіть невід'ємне ціле число");
        return;
      }
      parsed = Math.trunc(n);
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/manager/sales/${saleId}/debt-term`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ debtTermDays: parsed }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        setError(data?.error ?? "Не вдалося зберегти");
        return;
      }
      const data = (await res.json()) as { debtTermDays: number | null };
      setSaved(data.debtTermDays);
      setValue(data.debtTermDays == null ? "" : String(data.debtTermDays));
      router.refresh();
    } catch {
      setError("Помилка мережі");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-lg border bg-white p-5">
      <h2 className="text-base font-semibold text-gray-800">
        Днів до закриття (відстрочка боргу)
      </h2>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <input
          type="number"
          min={0}
          step={1}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
          }}
          placeholder={`за замовчуванням (${DEFAULT_TERM_DAYS})`}
          className="w-56 rounded-md border border-gray-300 px-2 py-1.5 text-sm"
        />
        <button
          type="button"
          onClick={save}
          disabled={saving || !dirty}
          className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {saving ? "Збереження…" : "Зберегти"}
        </button>
      </div>
      <p className="mt-2 text-xs text-gray-500">
        Порожньо = використовується «Відстрочка за замовчуванням, днів» зі звіту
        «Прострочені борги» (зараз {DEFAULT_TERM_DAYS}).
      </p>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </section>
  );
}
