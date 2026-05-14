"use client";

import { Input } from "@ltex/ui";

interface Props {
  label: string;
  value: string | undefined; // YYYY-MM-DD
  onChange: (v: string | undefined) => void;
}

export function DateBefore({ label, value, onChange }: Props) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">
        {label}
      </span>
      <Input
        type="date"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || undefined)}
      />
    </label>
  );
}
