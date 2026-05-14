"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import {
  Button,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@ltex/ui";
import { SlidersHorizontal } from "lucide-react";
import type { DictionaryOption } from "./types";

interface Props {
  statuses: Array<{ code: string; label: string; colorHex: string }>;
  channels: DictionaryOption[];
  deliveries: DictionaryOption[];
}

export function ClientListFilterSheet({
  statuses,
  channels,
  deliveries,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const [, startTransition] = useTransition();

  const status = searchParams.get("status") ?? "";
  const channel = searchParams.get("channel") ?? "";
  const deliveryMethod = searchParams.get("deliveryMethod") ?? "";

  function apply(next: {
    status?: string;
    channel?: string;
    deliveryMethod?: string;
  }) {
    const sp = new URLSearchParams(searchParams.toString());
    const merged = { status, channel, deliveryMethod, ...next };
    if (merged.status) sp.set("status", merged.status);
    else sp.delete("status");
    if (merged.channel) sp.set("channel", merged.channel);
    else sp.delete("channel");
    if (merged.deliveryMethod) sp.set("deliveryMethod", merged.deliveryMethod);
    else sp.delete("deliveryMethod");
    sp.delete("page");
    startTransition(() => router.push(`${pathname}?${sp.toString()}`));
  }

  function reset() {
    const sp = new URLSearchParams(searchParams.toString());
    sp.delete("status");
    sp.delete("channel");
    sp.delete("deliveryMethod");
    sp.delete("page");
    startTransition(() => router.push(`${pathname}?${sp.toString()}`));
    setOpen(false);
  }

  const activeCount =
    Number(Boolean(status)) +
    Number(Boolean(channel)) +
    Number(Boolean(deliveryMethod));

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" type="button" className="gap-2">
          <SlidersHorizontal className="h-4 w-4" />
          Фільтри
          {activeCount > 0 && (
            <span className="rounded-full bg-blue-500 px-1.5 py-0 text-xs text-white">
              {activeCount}
            </span>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Фільтри клієнтів</SheetTitle>
          <SheetDescription>
            Уточніть список за статусом, каналом пошуку або способом доставки.
          </SheetDescription>
        </SheetHeader>
        <div className="mt-6 space-y-5">
          <FieldGroup label="Статус">
            <SelectInput
              value={status}
              onChange={(v) => apply({ status: v })}
              placeholder="Усі статуси"
              options={statuses.map((s) => ({ value: s.code, label: s.label }))}
            />
          </FieldGroup>
          <FieldGroup label="Канал пошуку">
            <SelectInput
              value={channel}
              onChange={(v) => apply({ channel: v })}
              placeholder="Усі канали"
              options={channels.map((c) => ({ value: c.code, label: c.label }))}
            />
          </FieldGroup>
          <FieldGroup label="Спосіб доставки">
            <SelectInput
              value={deliveryMethod}
              onChange={(v) => apply({ deliveryMethod: v })}
              placeholder="Усі способи"
              options={deliveries.map((d) => ({
                value: d.code,
                label: d.label,
              }))}
            />
          </FieldGroup>
        </div>
        <div className="mt-8 flex justify-between">
          <Button variant="outline" type="button" onClick={reset}>
            Скинути
          </Button>
          <Button type="button" onClick={() => setOpen(false)}>
            Готово
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function FieldGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">
        {label}
      </span>
      {children}
    </label>
  );
}

function SelectInput({
  value,
  onChange,
  placeholder,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-md border bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
    >
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
