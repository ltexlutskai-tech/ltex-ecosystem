"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Input } from "@ltex/ui";
import { Plus, X } from "lucide-react";

export interface SeatInit {
  id: string;
  weight: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  note: string | null;
}

/** Рядок редактора — значення тримаємо рядками, щоб поля можна було чистити. */
interface SeatRow {
  weight: string;
  lengthCm: string;
  widthCm: string;
  heightCm: string;
  note: string;
}

/** Готові пресети габаритів (см) — вагу склад вписує сам. */
const PRESETS: { label: string; l: number; w: number; h: number }[] = [
  { label: "Мініпалета", l: 60, w: 40, h: 40 },
  { label: "Середня палета", l: 100, w: 60, h: 60 },
  { label: "Палета", l: 120, w: 80, h: 80 },
  { label: "Коробка/мішок", l: 0, w: 0, h: 0 },
];

const BASE = "/api/v1/manager/warehouse-tasks";

function emptyRow(): SeatRow {
  return { weight: "", lengthCm: "", widthCm: "", heightCm: "", note: "" };
}

function toRow(s: SeatInit): SeatRow {
  return {
    weight: String(s.weight),
    lengthCm: String(s.lengthCm),
    widthCm: String(s.widthCm),
    heightCm: String(s.heightCm),
    note: s.note ?? "",
  };
}

function num(v: string): number {
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

interface TtnResult {
  ok: boolean;
  number?: string;
  error?: string;
}

/**
 * Редактор фактичних місць відправлення (габарити). Зберігає місця й одразу
 * оновлює ТТН у Новій Пошті через POST /seats. Показує новий номер ТТН або
 * помилку. Доступний лише складу/адміну/власнику.
 */
export function SeatsEditor({
  taskId,
  initialSeats,
}: {
  taskId: string;
  initialSeats: SeatInit[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [rows, setRows] = useState<SeatRow[]>(
    initialSeats.length ? initialSeats.map(toRow) : [emptyRow()],
  );
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<TtnResult | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  function update(i: number, patch: Partial<SeatRow>) {
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  function removeRow(i: number) {
    setRows((rs) => (rs.length > 1 ? rs.filter((_, idx) => idx !== i) : rs));
  }
  function addRow() {
    setRows((rs) => [...rs, emptyRow()]);
  }
  function addPreset(p: (typeof PRESETS)[number]) {
    setRows((rs) => [
      ...rs,
      {
        weight: "",
        lengthCm: p.l ? String(p.l) : "",
        widthCm: p.w ? String(p.w) : "",
        heightCm: p.h ? String(p.h) : "",
        note: "",
      },
    ]);
  }

  async function save() {
    setBusy(true);
    setResult(null);
    setSaveError(null);
    try {
      const seats = rows.map((r) => ({
        weight: num(r.weight),
        lengthCm: num(r.lengthCm),
        widthCm: num(r.widthCm),
        heightCm: num(r.heightCm),
        note: r.note.trim() || null,
      }));
      const res = await fetch(`${BASE}/${taskId}/seats`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seats }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        error?: string;
        ttn?: TtnResult;
      };
      if (!res.ok) {
        setSaveError(j.error ?? "Не вдалося зберегти місця");
        return;
      }
      setResult(j.ttn ?? { ok: false });
      startTransition(() => router.refresh());
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-lg border bg-white p-5 shadow-sm">
      <h2 className="mb-1 text-base font-semibold text-gray-800">
        Місця відправлення (габарити)
      </h2>
      <p className="mb-3 text-xs text-gray-500">
        Впишіть фактичні місця (вагу й розміри) — вони оновлять ТТН у Новій
        Пошті.
      </p>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs uppercase tracking-wide text-gray-400">
              <th className="w-8 px-2 py-2 font-medium">№</th>
              <th className="px-2 py-2 font-medium">Вага, кг</th>
              <th className="px-2 py-2 font-medium">Довжина, см</th>
              <th className="px-2 py-2 font-medium">Ширина, см</th>
              <th className="px-2 py-2 font-medium">Висота, см</th>
              <th className="w-10 px-2 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-b last:border-b-0">
                <td className="px-2 py-2 text-gray-500">{i + 1}</td>
                <td className="px-2 py-2">
                  <Input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    value={r.weight}
                    onChange={(e) => update(i, { weight: e.target.value })}
                    aria-label={`Вага місця ${i + 1}`}
                    className="w-24"
                  />
                </td>
                <td className="px-2 py-2">
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    value={r.lengthCm}
                    onChange={(e) => update(i, { lengthCm: e.target.value })}
                    aria-label={`Довжина місця ${i + 1}`}
                    className="w-24"
                  />
                </td>
                <td className="px-2 py-2">
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    value={r.widthCm}
                    onChange={(e) => update(i, { widthCm: e.target.value })}
                    aria-label={`Ширина місця ${i + 1}`}
                    className="w-24"
                  />
                </td>
                <td className="px-2 py-2">
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    value={r.heightCm}
                    onChange={(e) => update(i, { heightCm: e.target.value })}
                    aria-label={`Висота місця ${i + 1}`}
                    className="w-24"
                  />
                </td>
                <td className="px-2 py-2 text-center">
                  <button
                    type="button"
                    onClick={() => removeRow(i)}
                    disabled={rows.length <= 1}
                    className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-red-600 disabled:opacity-40"
                    aria-label={`Видалити місце ${i + 1}`}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={addRow}
          className="text-sm"
        >
          <Plus className="mr-1 h-4 w-4" />
          Додати місце
        </Button>
        {PRESETS.map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => addPreset(p)}
            className="rounded-full border border-gray-300 px-3 py-1 text-xs text-gray-700 hover:border-green-500 hover:bg-green-50"
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="mt-4">
        <Button
          type="button"
          disabled={busy}
          onClick={() => void save()}
          className="bg-blue-600 text-white hover:bg-blue-700"
        >
          {busy ? "Збереження…" : "Зберегти місця й оновити ТТН"}
        </Button>
      </div>

      {saveError && (
        <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {saveError}
        </p>
      )}
      {result && result.ok && result.number && (
        <p className="mt-3 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
          ТТН оновлено: <span className="font-mono">{result.number}</span>
        </p>
      )}
      {result && !result.ok && (
        <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {result.error ?? "Не вдалося оновити ТТН"}
        </p>
      )}
    </section>
  );
}
