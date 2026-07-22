"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@ltex/ui";
import {
  WAREHOUSE_TASK_STATUS_LIST,
  WAREHOUSE_TASK_STATUS_LABEL,
  WAREHOUSE_TASK_DELIVERY_LIST,
  WAREHOUSE_TASK_DELIVERY_LABEL,
} from "@/lib/manager/warehouse-tasks-list";

/**
 * Тулбар фільтрів списку складських завдань. Веде URL-параметри
 * (`status`/`customerName`/`deliveryMethod`), які читає серверна сторінка.
 */
export function WarehouseTasksToolbar() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const [customer, setCustomer] = useState(
    searchParams.get("customerName") ?? "",
  );
  const status = searchParams.get("status") ?? "";
  const deliveryMethod = searchParams.get("deliveryMethod") ?? "";

  // Живий пошук по клієнту (debounce 350мс) без Enter.
  useEffect(() => {
    const urlValue = searchParams.get("customerName") ?? "";
    if (customer.trim() === urlValue) return;
    const handle = window.setTimeout(() => {
      const sp = new URLSearchParams(searchParams.toString());
      if (customer.trim()) sp.set("customerName", customer.trim());
      else sp.delete("customerName");
      sp.delete("page");
      startTransition(() => router.replace(`${pathname}?${sp.toString()}`));
    }, 350);
    return () => window.clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customer, searchParams]);

  function setParam(name: string, value: string | null) {
    const sp = new URLSearchParams(searchParams.toString());
    if (value === null || value === "") sp.delete(name);
    else sp.set(name, value);
    sp.delete("page");
    startTransition(() => router.push(`${pathname}?${sp.toString()}`));
  }

  function clearAll() {
    setCustomer("");
    startTransition(() => router.push(pathname));
  }

  const hasAny = Boolean(customer || status || deliveryMethod);

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-white p-3">
      <div className="relative min-w-[220px] flex-1">
        <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <Input
          type="search"
          value={customer}
          onChange={(e) => setCustomer(e.target.value)}
          placeholder="Пошук за клієнтом…"
          className="pl-8"
        />
      </div>

      <select
        value={status}
        onChange={(e) => setParam("status", e.target.value || null)}
        className="h-9 rounded-md border border-gray-300 bg-white px-2 text-sm text-gray-700"
        aria-label="Фільтр за статусом"
      >
        <option value="">Активні (нові + в роботі)</option>
        <option value="all">Усі статуси</option>
        {WAREHOUSE_TASK_STATUS_LIST.map((s) => (
          <option key={s} value={s}>
            {WAREHOUSE_TASK_STATUS_LABEL[s]}
          </option>
        ))}
      </select>

      <select
        value={deliveryMethod}
        onChange={(e) => setParam("deliveryMethod", e.target.value || null)}
        className="h-9 rounded-md border border-gray-300 bg-white px-2 text-sm text-gray-700"
        aria-label="Фільтр за доставкою"
      >
        <option value="">Уся доставка</option>
        {WAREHOUSE_TASK_DELIVERY_LIST.map((d) => (
          <option key={d} value={d}>
            {WAREHOUSE_TASK_DELIVERY_LABEL[d]}
          </option>
        ))}
      </select>

      {hasAny && (
        <button
          type="button"
          onClick={clearAll}
          className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900"
        >
          <X className="h-4 w-4" />
          Очистити
        </button>
      )}
    </div>
  );
}
