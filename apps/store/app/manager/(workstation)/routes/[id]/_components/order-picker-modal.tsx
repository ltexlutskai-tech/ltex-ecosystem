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
  orderDate: string;
  totalUah: number;
  totalEur: number;
  alreadyOnThisSheet: boolean;
  customer: {
    id: string;
    name: string;
    city: string | null;
    region: string | null;
  };
}

/** ISO → коротка дата dd.mm.yy. */
function shortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("uk-UA");
}

/**
 * Пікер доступних замовлень для маршрутного листа. Показує замовлення, що
 * ще не в жодному маршруті (`routeSheetId IS NULL`), + ті, що вже на цьому
 * МЛ (позначені, вибрані за замовчуванням не пропонуються повторно).
 * Мульти-вибір через чекбокси.
 *
 * Фільтри (server-side): пошук, діапазон дати (Дата з/по), Місто, Область.
 * Колонки рядка: Дата · Клієнт · Місто · Область · Сума.
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
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [city, setCity] = useState("");
  const [region, setRegion] = useState("");
  const [orders, setOrders] = useState<AvailableOrder[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  const fetchOrders = useCallback(
    async (filters: {
      search: string;
      from: string;
      to: string;
      city: string;
      region: string;
    }) => {
      setLoading(true);
      try {
        const url = new URL(
          "/api/v1/manager/orders/available-for-route",
          window.location.origin,
        );
        url.searchParams.set("routeSheetId", routeSheetId);
        if (filters.search.trim())
          url.searchParams.set("search", filters.search.trim());
        if (filters.city.trim())
          url.searchParams.set("city", filters.city.trim());
        if (filters.region.trim())
          url.searchParams.set("region", filters.region.trim());
        if (filters.from) url.searchParams.set("from", filters.from);
        if (filters.to)
          url.searchParams.set("to", `${filters.to}T23:59:59.999Z`);
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
      void fetchOrders({ search: "", from: "", to: "", city: "", region: "" });
    }
  }, [open, fetchOrders]);

  function applyFilters() {
    void fetchOrders({ search, from, to, city, region });
  }

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
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Додати замовлення</DialogTitle>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            applyFilters();
          }}
          className="space-y-2"
        >
          <div className="flex items-center gap-2">
            <div className="relative min-w-0 flex-1">
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
          </div>

          <div className="flex flex-wrap items-end gap-2 text-sm">
            <div className="flex items-center gap-1">
              <label className="text-xs text-gray-500" htmlFor="op-from">
                Дата з
              </label>
              <Input
                id="op-from"
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="h-9 w-[140px]"
              />
            </div>
            <div className="flex items-center gap-1">
              <label className="text-xs text-gray-500" htmlFor="op-to">
                по
              </label>
              <Input
                id="op-to"
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="h-9 w-[140px]"
              />
            </div>
            <Input
              type="text"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="Місто"
              className="h-9 w-[140px]"
              aria-label="Фільтр за містом"
            />
            <Input
              type="text"
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              placeholder="Область"
              className="h-9 w-[140px]"
              aria-label="Фільтр за областю"
            />
            <Button type="submit" variant="outline" size="sm">
              Застосувати
            </Button>
          </div>
        </form>

        <div className="max-h-[50vh] overflow-auto rounded-md border">
          {loading ? (
            <p className="px-4 py-6 text-center text-sm text-gray-500">
              Завантаження…
            </p>
          ) : orders.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-gray-500">
              Немає доступних замовлень за фільтрами.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50 text-left text-gray-500">
                  <th className="w-8 px-2 py-2"></th>
                  <th className="px-3 py-2 font-medium">Дата</th>
                  <th className="px-3 py-2 font-medium">Клієнт</th>
                  <th className="px-3 py-2 font-medium">Місто</th>
                  <th className="px-3 py-2 font-medium">Область</th>
                  <th className="px-3 py-2 text-right font-medium">Сума</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr
                    key={o.id}
                    className="cursor-pointer border-b last:border-b-0 hover:bg-gray-50"
                    onClick={() => toggle(o.id)}
                  >
                    <td className="px-2 py-2">
                      <input
                        type="checkbox"
                        checked={selected.has(o.id)}
                        onChange={() => toggle(o.id)}
                        onClick={(e) => e.stopPropagation()}
                        className="h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
                      />
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-gray-600">
                      {shortDate(o.orderDate)}
                    </td>
                    <td className="min-w-0 px-3 py-2">
                      <span className="block break-words font-medium text-gray-800">
                        {o.customer.name}
                      </span>
                      <span className="block text-xs text-gray-400">
                        {o.orderNumber ? `№${o.orderNumber}` : "новий"}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-gray-600">
                      {o.customer.city ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-gray-600">
                      {o.customer.region ?? "—"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right text-gray-700">
                      {Math.round(o.totalUah).toLocaleString("uk-UA")} ₴
                      <span className="ml-1 text-xs text-gray-400">
                        · {o.totalEur.toFixed(2)} €
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
