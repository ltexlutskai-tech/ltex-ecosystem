"use client";

import { useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Button, Input } from "@ltex/ui";

export interface ExtraField {
  /** Ключ URL-параметра. */
  key: string;
  label: string;
  placeholder?: string;
  /** Якщо передано — рендеримо select; інакше текстовий пошук. */
  options?: { value: string; label: string }[];
}

/**
 * Спільний рядок фільтрів для переглядачів регістрів-оборотів:
 * період (з/по) + довільні текстові/select-поля. Стан синхронізується з URL.
 */
export function RegisterPeriodFilters({
  initial,
  extra = [],
}: {
  initial: Record<string, string>;
  extra?: ExtraField[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [values, setValues] = useState<Record<string, string>>({
    from: initial.from ?? "",
    to: initial.to ?? "",
    ...Object.fromEntries(extra.map((f) => [f.key, initial[f.key] ?? ""])),
  });

  function set(key: string, value: string) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  function apply() {
    const sp = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(values)) {
      const v = value.trim();
      if (v) sp.set(key, v);
      else sp.delete(key);
    }
    sp.delete("page");
    router.push(`${pathname}?${sp.toString()}`);
  }

  function reset() {
    router.push(pathname);
  }

  return (
    <div className="flex flex-wrap items-end gap-2">
      <Field label="Період з">
        <Input
          type="date"
          value={values.from}
          onChange={(e) => set("from", e.target.value)}
          className="h-8 w-36 text-sm"
        />
      </Field>
      <Field label="по">
        <Input
          type="date"
          value={values.to}
          onChange={(e) => set("to", e.target.value)}
          className="h-8 w-36 text-sm"
        />
      </Field>
      {extra.map((f) => (
        <Field key={f.key} label={f.label}>
          {f.options ? (
            <select
              value={values[f.key]}
              onChange={(e) => set(f.key, e.target.value)}
              className="h-8 rounded-md border border-gray-300 px-2 text-sm text-gray-800 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              <option value="">Усі</option>
              {f.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          ) : (
            <Input
              type="text"
              placeholder={f.placeholder}
              value={values[f.key]}
              onChange={(e) => set(f.key, e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") apply();
              }}
              className="h-8 w-44 text-sm"
            />
          )}
        </Field>
      ))}
      <Button type="button" size="sm" onClick={apply} className="h-8">
        Застосувати
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={reset}
        className="h-8"
      >
        Скинути
      </Button>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-0.5">
      <span className="text-xs text-gray-500">{label}</span>
      {children}
    </label>
  );
}
