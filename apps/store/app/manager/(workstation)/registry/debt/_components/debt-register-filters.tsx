"use client";

import { useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Button, Input } from "@ltex/ui";
import {
  DEBT_MOVEMENT_KINDS,
  DEBT_KIND_LABEL,
} from "@/lib/manager/debt-register-view";

/** Рядок фільтрів регістру боргу: період, пошук клієнта, вид. */
export function DebtRegisterFilters({
  initial,
}: {
  initial: { from: string; to: string; q: string; kind: string };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [q, setQ] = useState(initial.q);
  const [kind, setKind] = useState(initial.kind);

  function apply() {
    const sp = new URLSearchParams(searchParams.toString());
    setOrDelete(sp, "from", from);
    setOrDelete(sp, "to", to);
    setOrDelete(sp, "q", q.trim());
    setOrDelete(sp, "kind", kind);
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
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          className="h-8 w-36 text-sm"
        />
      </Field>
      <Field label="по">
        <Input
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          className="h-8 w-36 text-sm"
        />
      </Field>
      <Field label="Клієнт">
        <Input
          type="text"
          placeholder="пошук за іменем"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") apply();
          }}
          className="h-8 w-48 text-sm"
        />
      </Field>
      <Field label="Вид">
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value)}
          className="h-8 rounded-md border border-gray-300 px-2 text-sm text-gray-800 focus:outline-none focus:ring-1 focus:ring-emerald-500"
        >
          <option value="">Усі</option>
          {DEBT_MOVEMENT_KINDS.map((k) => (
            <option key={k} value={k}>
              {DEBT_KIND_LABEL[k]}
            </option>
          ))}
        </select>
      </Field>
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

function setOrDelete(sp: URLSearchParams, key: string, value: string) {
  if (value) sp.set(key, value);
  else sp.delete(key);
}
