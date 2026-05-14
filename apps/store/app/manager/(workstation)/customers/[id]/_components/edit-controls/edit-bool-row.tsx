"use client";

interface Props {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
  description?: string;
}

export function EditBoolRow({ label, value, onChange, description }: Props) {
  return (
    <div className="flex items-start gap-2 text-sm">
      <dt className="w-44 shrink-0 pt-1.5 text-gray-500">{label}:</dt>
      <dd className="min-w-0 flex-1">
        <label className="inline-flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={value}
            onChange={(e) => onChange(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          {description && (
            <span className="text-xs text-gray-600">{description}</span>
          )}
        </label>
      </dd>
    </div>
  );
}
