"use client";

interface Props {
  label: string;
  /** ISO datetime string, or null. */
  value: string | null;
  /** Receives ISO datetime string (start-of-day UTC), or null when cleared. */
  onChange: (isoValue: string | null) => void;
}

function isoToDateInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function EditDateRow({ label, value, onChange }: Props) {
  return (
    <div className="flex items-start gap-2 text-sm">
      <dt className="w-44 shrink-0 pt-1.5 text-gray-500">{label}:</dt>
      <dd className="min-w-0 flex-1">
        <input
          type="date"
          value={isoToDateInput(value)}
          onChange={(e) => {
            const raw = e.target.value;
            if (raw === "") {
              onChange(null);
              return;
            }
            const d = new Date(`${raw}T00:00:00.000Z`);
            onChange(Number.isNaN(d.getTime()) ? null : d.toISOString());
          }}
          className="w-full rounded-md border border-gray-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none"
        />
      </dd>
    </div>
  );
}
