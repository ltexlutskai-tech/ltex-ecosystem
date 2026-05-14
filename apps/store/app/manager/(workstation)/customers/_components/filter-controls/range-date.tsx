"use client";

import { Input } from "@ltex/ui";

interface Props {
  label: string;
  from: string | undefined; // YYYY-MM-DD
  to: string | undefined;
  onChange: (next: { from?: string; to?: string }) => void;
}

export function RangeDate({ label, from, to, onChange }: Props) {
  return (
    <div className="block">
      <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">
        {label}
      </span>
      <div className="flex items-center gap-2">
        <Input
          type="date"
          value={from ?? ""}
          onChange={(e) => onChange({ from: e.target.value || undefined, to })}
        />
        <span className="text-gray-400">–</span>
        <Input
          type="date"
          value={to ?? ""}
          onChange={(e) => onChange({ from, to: e.target.value || undefined })}
        />
      </div>
    </div>
  );
}
