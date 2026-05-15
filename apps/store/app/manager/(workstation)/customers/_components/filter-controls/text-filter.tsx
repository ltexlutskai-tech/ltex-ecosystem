"use client";

import { Input } from "@ltex/ui";

interface Props {
  label: string;
  value: string;
  placeholder?: string;
  onChange: (v: string) => void;
}

export function TextFilter({ label, value, placeholder, onChange }: Props) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">
        {label}
      </span>
      <Input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
