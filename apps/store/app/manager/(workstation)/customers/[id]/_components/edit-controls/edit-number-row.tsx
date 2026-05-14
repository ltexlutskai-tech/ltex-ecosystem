"use client";

interface Props {
  label: string;
  value: string | number | null;
  onChange: (value: number | null) => void;
  step?: number;
  min?: number;
  placeholder?: string;
  suffix?: string;
}

export function EditNumberRow({
  label,
  value,
  onChange,
  step = 1,
  min,
  placeholder,
  suffix,
}: Props) {
  const display =
    value === null || value === undefined || value === "" ? "" : String(value);
  return (
    <div className="flex items-start gap-2 text-sm">
      <dt className="w-44 shrink-0 pt-1.5 text-gray-500">{label}:</dt>
      <dd className="flex min-w-0 flex-1 items-center gap-2">
        <input
          type="number"
          inputMode="decimal"
          value={display}
          step={step}
          min={min}
          placeholder={placeholder}
          onChange={(e) => {
            const raw = e.target.value;
            if (raw === "") {
              onChange(null);
              return;
            }
            const parsed = Number.parseFloat(raw);
            onChange(Number.isFinite(parsed) ? parsed : null);
          }}
          className="w-full rounded-md border border-gray-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none"
        />
        {suffix && (
          <span className="shrink-0 text-xs text-gray-500">{suffix}</span>
        )}
      </dd>
    </div>
  );
}
