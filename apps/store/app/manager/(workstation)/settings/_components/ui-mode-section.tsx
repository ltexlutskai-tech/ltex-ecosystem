"use client";

import { useState } from "react";
import { Check, LayoutGrid, PanelsTopLeft } from "lucide-react";
import { cn } from "@ltex/ui";
import type { UiMode } from "@/lib/manager/ui-mode";

/**
 * Перемикач вигляду робочого простору: «Класичний» (вкладки/вікна, як у 1С) чи
 * «Простий» (одне вікно). Зміна пише cookie через API і перезавантажує весь
 * застосунок на верхньому рівні (`window.top`) — щоб root-layout перечитав
 * cookie й змонтував нову оболонку (у класичному режимі сторінка живе в iframe,
 * тож reload лише iframe не перемкнув би оболонку).
 */
export function UiModeSection({ initialMode }: { initialMode: UiMode }) {
  const [mode, setMode] = useState<UiMode>(initialMode);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function choose(next: UiMode) {
    if (next === mode || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/manager/settings/ui-mode", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: next }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? `HTTP ${res.status}`);
        setBusy(false);
        return;
      }
      setMode(next);
      // Перезавантажити застосунок згори — щоб оболонка перемкнулася.
      const top = window.top ?? window;
      top.location.href = "/manager";
    } catch (e) {
      setError(e instanceof Error ? e.message : "Помилка");
      setBusy(false);
    }
  }

  return (
    <section className="rounded-lg border bg-white p-4">
      <h2 className="text-sm font-semibold text-gray-700">
        Вигляд робочого простору
      </h2>
      <p className="mt-1 text-xs text-gray-500">
        Як відкриваються документи. «Простий» — одне вікно з лівим меню (без
        вкладок і окремих вікон). Змінюється лише спосіб навігації — самі екрани
        ті самі. Можна перемкнути назад будь-коли.
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <ModeCard
          selected={mode === "classic"}
          disabled={busy}
          onSelect={() => choose("classic")}
          icon={<LayoutGrid className="h-5 w-5" />}
          title="Класичний"
          desc="Вкладки та окремі вікна, як у 1С."
        />
        <ModeCard
          selected={mode === "simple"}
          disabled={busy}
          onSelect={() => choose("simple")}
          icon={<PanelsTopLeft className="h-5 w-5" />}
          title="Простий"
          desc="Одне вікно, ліве меню, без вкладок."
        />
      </div>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </section>
  );
}

function ModeCard({
  selected,
  disabled,
  onSelect,
  icon,
  title,
  desc,
}: {
  selected: boolean;
  disabled: boolean;
  onSelect: () => void;
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      aria-pressed={selected}
      className={cn(
        "relative flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-colors disabled:opacity-60",
        selected
          ? "border-green-500 bg-green-50 ring-1 ring-green-500"
          : "border-gray-200 hover:bg-gray-50",
      )}
    >
      {selected && (
        <span className="absolute top-2 right-2 flex h-5 w-5 items-center justify-center rounded-full bg-green-600 text-white">
          <Check className="h-3.5 w-3.5" />
        </span>
      )}
      <span
        className={cn("mt-0.5", selected ? "text-green-700" : "text-gray-500")}
      >
        {icon}
      </span>
      <span className="text-sm font-medium text-gray-800">{title}</span>
      <span className="text-xs text-gray-500">{desc}</span>
    </button>
  );
}
