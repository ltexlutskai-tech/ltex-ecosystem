"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp, Plus, Route, Trash2, X } from "lucide-react";
import { Button, useToast } from "@ltex/ui";
import type { ClientRouteRef } from "./types";

interface RouteOption {
  id: string;
  name: string;
}

interface Props {
  clientId: string;
  routes: ClientRouteRef[];
  /** id маршруту з `primaryRoute` (помічаємо «основний»). */
  primaryRouteId: string | null;
  /** true → masked read-only view (чужий клієнт). */
  isForeign?: boolean;
  /** true → owner/admin, можна додавати/видаляти/змінювати порядок. */
  canEdit?: boolean;
}

function AddRouteForm({
  clientId,
  assignedRouteIds,
  onAdded,
  onCancel,
}: {
  clientId: string;
  assignedRouteIds: Set<string>;
  onAdded: () => void;
  onCancel: () => void;
}) {
  const { toast } = useToast();
  const [options, setOptions] = useState<RouteOption[]>([]);
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/v1/manager/dictionaries", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((data: { routes?: RouteOption[] }) => {
        if (active) setOptions(data.routes ?? []);
      })
      .catch(() => {
        if (active)
          toast({
            description: "Не вдалося завантажити довідник маршрутів",
            variant: "destructive",
          });
      });
    return () => {
      active = false;
    };
  }, [toast]);

  // Виключаємо вже призначені маршрути.
  const available = options.filter((o) => !assignedRouteIds.has(o.id));

  async function submit() {
    if (!selected) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/v1/manager/clients/${clientId}/routes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ routeId: selected }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        toast({
          description: err.error ?? "Помилка додавання",
          variant: "destructive",
        });
        return;
      }
      setSelected("");
      onAdded();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 border-t pt-3">
      <select
        value={selected}
        onChange={(e) => setSelected(e.target.value)}
        className="h-8 min-w-[12rem] rounded-md border border-gray-300 bg-white px-2 text-sm"
      >
        <option value="">— оберіть маршрут —</option>
        {available.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
      <div className="ml-auto flex items-center gap-1.5">
        <Button
          type="button"
          size="sm"
          onClick={submit}
          disabled={busy || !selected}
        >
          Додати
        </Button>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          aria-label="Скасувати"
          className="flex h-7 w-7 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      {available.length === 0 && (
        <p className="w-full text-xs text-gray-500">
          Усі доступні маршрути вже призначено.
        </p>
      )}
    </div>
  );
}

function RouteRow({
  route,
  clientId,
  canEdit,
  isPrimary,
  isFirst,
  isLast,
  onChanged,
}: {
  route: ClientRouteRef;
  clientId: string;
  canEdit: boolean;
  isPrimary: boolean;
  isFirst: boolean;
  isLast: boolean;
  onChanged: () => void;
}) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  async function move(direction: "up" | "down") {
    setBusy(true);
    try {
      const res = await fetch(
        `/api/v1/manager/clients/${clientId}/routes/${route.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ direction }),
        },
      );
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        toast({
          description: err.error ?? "Помилка зміни порядку",
          variant: "destructive",
        });
        return;
      }
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm("Прибрати цей маршрут?")) return;
    setBusy(true);
    try {
      const res = await fetch(
        `/api/v1/manager/clients/${clientId}/routes/${route.id}`,
        { method: "DELETE", credentials: "include" },
      );
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        toast({
          description: err.error ?? "Помилка видалення",
          variant: "destructive",
        });
        return;
      }
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 py-2">
      <span
        className={
          route.isActive
            ? "text-sm font-medium text-gray-800"
            : "text-sm font-medium text-gray-400 line-through"
        }
      >
        {route.name}
      </span>
      {isPrimary && (
        <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] uppercase text-blue-700">
          основний
        </span>
      )}
      {!route.isActive && (
        <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500">
          неактивний
        </span>
      )}
      {canEdit && (
        <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => move("up")}
            disabled={busy || isFirst}
            aria-label="Вище"
            title="Вище"
            className="flex h-7 w-7 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ChevronUp className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => move("down")}
            disabled={busy || isLast}
            aria-label="Нижче"
            title="Нижче"
            className="flex h-7 w-7 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ChevronDown className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={remove}
            disabled={busy}
            aria-label="Прибрати"
            title="Прибрати"
            className="flex h-7 w-7 items-center justify-center rounded-md text-gray-400 hover:bg-red-50 hover:text-red-600"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

export function ClientRoutesSection({
  clientId,
  routes,
  primaryRouteId,
  isForeign = false,
  canEdit = false,
}: Props) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);

  const editable = canEdit && !isForeign;
  // Для foreign-view без маршрутів — нічого не показуємо (як phones-section).
  if (routes.length === 0 && !editable) return null;

  function refresh() {
    setAdding(false);
    router.refresh();
  }

  const assignedRouteIds = new Set(routes.map((r) => r.routeId));

  return (
    <div className="rounded-lg border bg-white p-5 shadow-sm">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-700">
          <Route className="h-4 w-4 text-gray-400" /> Маршрути
        </h3>
        {editable && !adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="flex items-center gap-1 rounded border bg-white px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            <Plus className="h-3.5 w-3.5" /> Додати
          </button>
        )}
      </div>

      {routes.length === 0 ? (
        <p className="text-sm text-gray-500">
          Клієнт не прив&apos;язаний до жодного маршруту.
        </p>
      ) : (
        <div className="divide-y divide-gray-100">
          {routes.map((r, i) => (
            <RouteRow
              key={r.id}
              route={r}
              clientId={clientId}
              canEdit={editable}
              isPrimary={primaryRouteId === r.routeId}
              isFirst={i === 0}
              isLast={i === routes.length - 1}
              onChanged={refresh}
            />
          ))}
        </div>
      )}

      {editable && adding && (
        <AddRouteForm
          clientId={clientId}
          assignedRouteIds={assignedRouteIds}
          onAdded={refresh}
          onCancel={() => setAdding(false)}
        />
      )}
    </div>
  );
}
