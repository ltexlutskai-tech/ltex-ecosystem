"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export interface PlanRowInput {
  regionSlug: string;
  label: string;
  planRevenueEur: number;
  planTtCount: number;
  planNewTtCount: number;
}

type Values = Record<
  string,
  { planRevenueEur: number; planTtCount: number; planNewTtCount: number }
>;

function initValues(rows: PlanRowInput[]): Values {
  const v: Values = {};
  for (const r of rows) {
    v[r.regionSlug] = {
      planRevenueEur: r.planRevenueEur,
      planTtCount: r.planTtCount,
      planNewTtCount: r.planNewTtCount,
    };
  }
  return v;
}

export function PlansEditor({
  month,
  totalRow,
  regionRows,
}: {
  month: string;
  totalRow: PlanRowInput;
  regionRows: PlanRowInput[];
}) {
  const router = useRouter();
  const allRows = [totalRow, ...regionRows];
  const [values, setValues] = useState<Values>(() => initValues(allRows));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function setField(
    slug: string,
    field: "planRevenueEur" | "planTtCount" | "planNewTtCount",
    raw: string,
  ) {
    const n = Number(raw.replace(/\s/g, "").replace(",", "."));
    setValues((prev) => {
      const cur = prev[slug] ?? {
        planRevenueEur: 0,
        planTtCount: 0,
        planNewTtCount: 0,
      };
      return {
        ...prev,
        [slug]: { ...cur, [field]: Number.isFinite(n) && n >= 0 ? n : 0 },
      };
    });
  }

  const valueFor = (slug: string) =>
    values[slug] ?? { planRevenueEur: 0, planTtCount: 0, planNewTtCount: 0 };

  async function save() {
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const plans = allRows.map((r) => ({
        regionSlug: r.regionSlug,
        ...values[r.regionSlug],
      }));
      const res = await fetch("/api/v1/manager/reports/plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month, plans }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `Помилка ${res.status}`);
      }
      setMessage("План збережено ✓");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не вдалося зберегти");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="mb-1 block text-gray-600">Місяць</span>
          <input
            type="month"
            defaultValue={month}
            onChange={(e) => {
              const m = e.target.value;
              if (m) router.push(`/manager/reports/plans?month=${m}`);
            }}
            className="h-10 rounded-md border border-gray-300 px-3 text-sm"
          />
        </label>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="h-10 rounded-md bg-green-600 px-4 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60"
        >
          {saving ? "Збереження…" : "Зберегти план"}
        </button>
        {message && <span className="text-sm text-green-700">{message}</span>}
        {error && <span className="text-sm text-red-600">{error}</span>}
      </div>

      <div className="overflow-x-auto rounded-md border border-gray-200">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-gray-50 text-left text-gray-600">
            <tr>
              <th className="px-3 py-2 font-medium">Область</th>
              <th className="px-3 py-2 text-right font-medium">Виручка, €</th>
              <th className="px-3 py-2 text-right font-medium">ТТ скупились</th>
              <th className="px-3 py-2 text-right font-medium">Нові ТТ</th>
            </tr>
          </thead>
          <tbody>
            {allRows.map((r) => {
              const isTotal = r.regionSlug === totalRow.regionSlug;
              const v = valueFor(r.regionSlug);
              return (
                <tr
                  key={r.regionSlug}
                  className={
                    isTotal
                      ? "border-b border-gray-200 bg-amber-50 font-medium"
                      : "border-b border-gray-100"
                  }
                >
                  <td className="px-3 py-1.5">{r.label}</td>
                  <td className="px-2 py-1 text-right">
                    <NumCell
                      value={v.planRevenueEur}
                      onChange={(val) =>
                        setField(r.regionSlug, "planRevenueEur", val)
                      }
                    />
                  </td>
                  <td className="px-2 py-1 text-right">
                    <NumCell
                      value={v.planTtCount}
                      onChange={(val) =>
                        setField(r.regionSlug, "planTtCount", val)
                      }
                    />
                  </td>
                  <td className="px-2 py-1 text-right">
                    <NumCell
                      value={v.planNewTtCount}
                      onChange={(val) =>
                        setField(r.regionSlug, "planNewTtCount", val)
                      }
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function NumCell({
  value,
  onChange,
}: {
  value: number;
  onChange: (raw: string) => void;
}) {
  return (
    <input
      type="number"
      min={0}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-28 rounded border border-gray-300 px-2 py-1 text-right"
    />
  );
}
