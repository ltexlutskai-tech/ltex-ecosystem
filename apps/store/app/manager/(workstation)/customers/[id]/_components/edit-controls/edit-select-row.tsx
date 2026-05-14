"use client";

import type { EditDictionaryOption } from "../../_lib/load-edit-dictionaries";

interface Props {
  label: string;
  value: string | null;
  onChange: (value: string | null) => void;
  options: EditDictionaryOption[];
  emptyLabel?: string;
  disabled?: boolean;
  disabledHint?: string;
}

export function EditSelectRow({
  label,
  value,
  onChange,
  options,
  emptyLabel = "— Не вибрано —",
  disabled = false,
  disabledHint,
}: Props) {
  return (
    <div className="flex items-start gap-2 text-sm">
      <dt className="w-44 shrink-0 pt-1.5 text-gray-500">{label}:</dt>
      <dd className="min-w-0 flex-1">
        <select
          value={value ?? ""}
          onChange={(e) => {
            const v = e.target.value;
            onChange(v === "" ? null : v);
          }}
          disabled={disabled}
          title={disabled ? disabledHint : undefined}
          className="w-full rounded-md border border-gray-300 bg-white px-2 py-1 text-sm focus:border-blue-500 focus:outline-none disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-500"
        >
          <option value="">{emptyLabel}</option>
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      </dd>
    </div>
  );
}
