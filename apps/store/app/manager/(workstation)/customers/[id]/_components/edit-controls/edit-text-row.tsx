"use client";

interface Props {
  label: string;
  value: string | null;
  onChange: (value: string | null) => void;
  type?: "text" | "url" | "tel";
  required?: boolean;
  placeholder?: string;
  maxLength?: number;
}

export function EditTextRow({
  label,
  value,
  onChange,
  type = "text",
  required = false,
  placeholder,
  maxLength,
}: Props) {
  return (
    <div className="flex items-start gap-2 text-sm">
      <dt className="w-44 shrink-0 pt-1.5 text-gray-500">
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}:
      </dt>
      <dd className="min-w-0 flex-1">
        <input
          type={type}
          value={value ?? ""}
          onChange={(e) => {
            const v = e.target.value;
            onChange(v === "" ? null : v);
          }}
          required={required}
          placeholder={placeholder}
          maxLength={maxLength}
          className="w-full rounded-md border border-gray-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none"
        />
      </dd>
    </div>
  );
}
