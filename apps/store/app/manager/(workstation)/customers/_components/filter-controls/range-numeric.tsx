"use client";

import { Input } from "@ltex/ui";

interface Props {
  label: string;
  unit?: string;
  min: number | undefined;
  max: number | undefined;
  onChange: (next: { min?: number; max?: number }) => void;
  integer?: boolean;
}

function parse(v: string, integer?: boolean): number | undefined {
  if (v.trim() === "") return undefined;
  const n = integer ? Number.parseInt(v, 10) : Number(v);
  return Number.isFinite(n) ? n : undefined;
}

export function RangeNumeric({
  label,
  unit,
  min,
  max,
  onChange,
  integer,
}: Props) {
  return (
    <div className="block">
      <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">
        {label}
        {unit ? `, ${unit}` : ""}
      </span>
      <div className="flex items-center gap-2">
        <Input
          type="number"
          inputMode={integer ? "numeric" : "decimal"}
          step={integer ? 1 : "any"}
          placeholder="мін"
          value={min ?? ""}
          onChange={(e) =>
            onChange({ min: parse(e.target.value, integer), max })
          }
        />
        <span className="text-gray-400">–</span>
        <Input
          type="number"
          inputMode={integer ? "numeric" : "decimal"}
          step={integer ? 1 : "any"}
          placeholder="макс"
          value={max ?? ""}
          onChange={(e) =>
            onChange({ min, max: parse(e.target.value, integer) })
          }
        />
      </div>
    </div>
  );
}
