"use client";

import { useCallback, useEffect, useState } from "react";
import { Search } from "lucide-react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
} from "@ltex/ui";

interface AvailableOrder {
  id: string;
  orderNumber: string | null;
  totalUah: number;
  alreadyOnThisSheet: boolean;
  customer: { id: string; name: string; city: string | null };
}

/**
 * Пікер доступних замовлень для маршрутного листа. Показує замовлення, що
 * ще не в жодному маршруті (`routeSheetId IS NULL`), + ті, що вже на цьому
 * МЛ (позначені, вибрані за замовчуванням не пропонуються повторно).
 * Мульти-вибір через чекбокси.
 */
export function OrderPickerModal({
  open,
  onOpenChange,
  routeSheetId,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  routeSheetId: string;
  onConfirm: (orderIds: string[]) => void | Promise<void>;
}) {
  const [search, setSearch] = useState("");
  const [orders, setOrders] = useState<AvailableOrder[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  const fetchOrders = useCallback(
    async (q: string) => {
      setLoading(true);
      try {
        const url = new URL(
          "/api/v1/manager/orders/available-for-route",
          window.location.origin,
        );
        url.searchParams.set("routeSheetId", routeSheetId);
        if (q.trim()) url.searchParams.set("search", q.trim());
        const res = await fetch(url.toString());
        if (!res.ok) {
          setOrders([]);
          return;
        }
        const data = (await res.json()) as { items: AvailableOrder[] };
        // Не пропонуємо повторно вже додані до цього МЛ.
        setOrders(data.items.filter((o) => !o.alreadyOnThisSheet));
      } finally {
        setLoading(false);
      }
    },
    [routeSheetId],
  );

  useEffect(() => {
    if (open) {
      setSelected(new Set());
      void fetchOrders("");
    }
  }, [open, fetchOrders]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Додати замовлення</DialogTitle>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void fetchOrders(search);
          }}
          className="flex items-center gap-2"
        >
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Пошук за №, клієнтом або містом…"
              className="pl-8"
            />
          </div>
          <Button type="submit" variant="outline" size="sm">
            Шукати
          </Button>
        </form>

        <div className="max-h-[50vh] overflow-y-auto rounded-md border">
          {loading ? (
            <p className="px-4 py-6 text-center text-sm text-gray-500">
              Завантаження…
            </p>
          ) : orders.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-gray-500">
              Немає доступних замовлень (усі вже у маршрутах).
            </p>
          ) : (
            <ul className="divide-y">
              {orders.map((o) => (
                <li key={o.id}>
                  <label className="flex cursor-pointer items-center gap-3 px-4 py-2.5 hover:bg-gray-50">
                    <input
                      type="checkbox"
                      checked={selected.has(o.id)}
                      onChange={() => toggle(o.id)}
                      className="h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-gray-800">
                        {o.customer.name}
                      </span>
                      <span className="block text-xs text-gray-500">
                        {o.orderNumber ? `№${o.orderNumber}` : "новий"}
                        {o.customer.city ? ` · ${o.customer.city}` : ""}
                      </span>
                    </span>
                    <span className="whitespace-nowrap text-sm text-gray-600">
                      {Math.round(o.totalUah).toLocaleString("uk-UA")} ₴
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Скасувати
          </Button>
          <Button
            type="button"
            disabled={selected.size === 0}
            onClick={() => void onConfirm([...selected])}
            className="bg-green-600 text-white hover:bg-green-700"
          >
            Додати ({selected.size})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
