"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, useToast } from "@ltex/ui";
import { Printer, Trash2, FileStack } from "lucide-react";

export interface RegistrableTtn {
  saleId: string;
  ttnRef: string;
  expressWaybill: string | null;
  npCityName: string | null;
  npWarehouseName: string | null;
  ttnCreatedAt: string | null;
  customerName: string | null;
}

export interface NpRegister {
  ref: string;
  number: string;
  date: string;
  count: number;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("uk-UA");
}

export function NpRegistersClient({
  registrable,
  registers,
}: {
  registrable: RegistrableTtn[];
  registers: NpRegister[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmingRef, setConfirmingRef] = useState<string | null>(null);
  const [confirmingTtnSaleId, setConfirmingTtnSaleId] = useState<string | null>(
    null,
  );
  const [isPending, startTransition] = useTransition();

  const allSelected = useMemo(
    () => registrable.length > 0 && selected.size === registrable.length,
    [registrable.length, selected.size],
  );

  function toggleOne(ttnRef: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(ttnRef)) next.delete(ttnRef);
      else next.add(ttnRef);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) =>
      prev.size === registrable.length
        ? new Set()
        : new Set(registrable.map((r) => r.ttnRef)),
    );
  }

  async function createRegister() {
    const documentRefs = [...selected];
    if (documentRefs.length === 0) return;
    startTransition(async () => {
      try {
        const res = await fetch("/api/v1/manager/np-registers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ documentRefs }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          toast({
            title: "Помилка",
            description: body.error ?? "Не вдалося створити реєстр",
            variant: "destructive",
          });
          return;
        }
        toast({ title: `Реєстр створено №${body.number ?? ""}` });
        setSelected(new Set());
        router.refresh();
      } catch (err) {
        toast({
          title: "Помилка",
          description: err instanceof Error ? err.message : String(err),
          variant: "destructive",
        });
      }
    });
  }

  async function deleteTtn(saleId: string) {
    startTransition(async () => {
      try {
        const res = await fetch("/api/v1/manager/np-registers/ttn", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ saleId }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          toast({
            title: "Помилка",
            description: body.error ?? "Не вдалося видалити ТТН",
            variant: "destructive",
          });
          return;
        }
        toast({ title: "ТТН видалено" });
        setConfirmingTtnSaleId(null);
        router.refresh();
      } catch (err) {
        toast({
          title: "Помилка",
          description: err instanceof Error ? err.message : String(err),
          variant: "destructive",
        });
      }
    });
  }

  function printRegister(ref: string) {
    window.open(`/api/v1/manager/np-registers/${ref}/print`, "_blank");
  }

  async function deleteRegister(ref: string) {
    startTransition(async () => {
      try {
        const res = await fetch(`/api/v1/manager/np-registers/${ref}`, {
          method: "DELETE",
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          toast({
            title: "Помилка",
            description: body.error ?? "Не вдалося видалити реєстр",
            variant: "destructive",
          });
          return;
        }
        toast({ title: "Реєстр видалено" });
        setConfirmingRef(null);
        router.refresh();
      } catch (err) {
        toast({
          title: "Помилка",
          description: err instanceof Error ? err.message : String(err),
          variant: "destructive",
        });
      }
    });
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* ── Готові ТТН (не в реєстрі) ─────────────────────────────────── */}
      <section className="rounded-lg border bg-white">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="text-sm font-semibold text-gray-900">
            Готові ТТН (не в реєстрі)
          </h2>
          <Button
            size="sm"
            onClick={createRegister}
            disabled={selected.size === 0 || isPending}
          >
            <FileStack className="mr-1.5 h-4 w-4" />
            Створити реєстр з обраних ({selected.size})
          </Button>
        </div>

        {registrable.length === 0 ? (
          <p className="px-4 py-6 text-sm text-gray-500">
            Немає готових ТТН для реєстру.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase text-gray-500">
                  <th className="px-4 py-2">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleAll}
                      aria-label="Обрати всі"
                    />
                  </th>
                  <th className="px-4 py-2">ТТН</th>
                  <th className="px-4 py-2">Клієнт</th>
                  <th className="px-4 py-2">Місто / відділення</th>
                  <th className="px-4 py-2">Дата</th>
                  <th className="px-4 py-2 text-right">Дії</th>
                </tr>
              </thead>
              <tbody>
                {registrable.map((t) => (
                  <tr key={t.saleId} className="border-b last:border-0">
                    <td className="px-4 py-2">
                      <input
                        type="checkbox"
                        checked={selected.has(t.ttnRef)}
                        onChange={() => toggleOne(t.ttnRef)}
                        aria-label={`Обрати ТТН ${t.expressWaybill ?? ""}`}
                      />
                    </td>
                    <td className="px-4 py-2 font-mono text-xs">
                      {t.expressWaybill ?? "—"}
                    </td>
                    <td className="px-4 py-2">{t.customerName ?? "—"}</td>
                    <td className="px-4 py-2 text-gray-600">
                      {[t.npCityName, t.npWarehouseName]
                        .filter(Boolean)
                        .join(", ") || "—"}
                    </td>
                    <td className="px-4 py-2 text-gray-600">
                      {formatDate(t.ttnCreatedAt)}
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex items-center justify-end">
                        {confirmingTtnSaleId === t.saleId ? (
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => deleteTtn(t.saleId)}
                            disabled={isPending}
                          >
                            Точно видалити ТТН?
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setConfirmingTtnSaleId(t.saleId)}
                          >
                            <Trash2 className="mr-1.5 h-4 w-4" />
                            Видалити ТТН
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Реєстри ───────────────────────────────────────────────────── */}
      <section className="rounded-lg border bg-white">
        <div className="border-b px-4 py-3">
          <h2 className="text-sm font-semibold text-gray-900">Реєстри</h2>
        </div>

        {registers.length === 0 ? (
          <p className="px-4 py-6 text-sm text-gray-500">Реєстрів ще немає.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase text-gray-500">
                  <th className="px-4 py-2">№</th>
                  <th className="px-4 py-2">Дата</th>
                  <th className="px-4 py-2">К-сть ТТН</th>
                  <th className="px-4 py-2 text-right">Дії</th>
                </tr>
              </thead>
              <tbody>
                {registers.map((r) => (
                  <tr key={r.ref} className="border-b last:border-0">
                    <td className="px-4 py-2 font-medium">{r.number}</td>
                    <td className="px-4 py-2 text-gray-600">
                      {formatDate(r.date)}
                    </td>
                    <td className="px-4 py-2 text-gray-600">{r.count}</td>
                    <td className="px-4 py-2">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => printRegister(r.ref)}
                        >
                          <Printer className="mr-1.5 h-4 w-4" />
                          Друк
                        </Button>
                        {confirmingRef === r.ref ? (
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => deleteRegister(r.ref)}
                            disabled={isPending}
                          >
                            Точно видалити?
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setConfirmingRef(r.ref)}
                          >
                            <Trash2 className="mr-1.5 h-4 w-4" />
                            Видалити
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
