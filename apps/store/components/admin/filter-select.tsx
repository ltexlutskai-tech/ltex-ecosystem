"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";

interface FilterSelectProps {
  paramName: string;
  options: { value: string; label: string }[];
  placeholder: string;
}

export function FilterSelect({
  paramName,
  options,
  placeholder,
}: FilterSelectProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const current = searchParams.get(paramName) ?? "";

  function onChange(value: string) {
    const sp = new URLSearchParams(searchParams.toString());
    if (value) {
      sp.set(paramName, value);
    } else {
      sp.delete(paramName);
    }
    sp.delete("page");
    router.push(`${pathname}?${sp.toString()}`);
  }

  return (
    <select
      value={current}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-md border bg-white px-3 py-2 text-sm"
    >
      <option value="">{placeholder}</option>
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}
