"use client";

import { useState, useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Button, Input } from "@ltex/ui";

/** Опис виміру/показника для UI (label з реєстру конкретного звіту). */
export interface OptionDef {
  key: string;
  label: string;
}

/**
 * Панель налаштувань гнучкого звіту (аналог 1С «Настройки»). Report-agnostic:
 * список вимірів і показників передається через props, тож той самий компонент
 * обслуговує і «Підсумок продажів», і «Маржа / Валовий прибуток».
 *
 * Стан → URL-параметри (GET) при «Сформувати»:
 *   groups — упорядкований CSV вимірів (рівні дерева)
 *   ind    — CSV показників
 *   f_<dim>— текстовий відбір (contains) по виміру
 *   totals — 1/0 загальні підсумки
 */
export function FlexConfig({
  dimensions,
  indicators,
  initial,
  commonFilters = ["region", "agent", "client", "product"],
  hideFrom = false,
  attrOptions,
  initialAttrs = [],
}: {
  dimensions: OptionDef[];
  indicators: OptionDef[];
  initial: {
    from: string;
    to: string;
    groups: string[];
    indicators: string[];
    totals: boolean;
    filters: Record<string, string>;
  };
  /** Виміри-кандидати для блоку «Відбори» додатково до обраних груп. */
  commonFilters?: string[];
  /**
   * Приховати поле «Період з» і перейменувати «по» → «Станом на».
   * Для звітів з балансовою семантикою (залишок на дату), де `from` не має сенсу.
   */
  hideFrom?: boolean;
  /**
   * Довідкові колонки товару (стиль 1С «Остатки товаров»). Коли передано —
   * показується блок «Колонки» з чекбоксами; вибір серіалізується у URL-параметр
   * `cols` (CSV). Інші звіти не передають → блок прихований, поведінка незмінна.
   */
  attrOptions?: OptionDef[];
  /** Початково обрані атрибутні колонки (ключі). */
  initialAttrs?: string[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [groups, setGroups] = useState<string[]>(initial.groups);
  const [ind, setInd] = useState<string[]>(initial.indicators);
  const [totals, setTotals] = useState(initial.totals);
  const [filters, setFilters] = useState<Record<string, string>>(
    initial.filters,
  );
  const [addKey, setAddKey] = useState("");
  const [attrs, setAttrs] = useState<string[]>(initialAttrs);

  const dimLabel = new Map(dimensions.map((d) => [d.key, d.label]));
  const dimKeys = new Set(dimensions.map((d) => d.key));
  const available = dimensions.filter((d) => !groups.includes(d.key));

  // Виміри для блоку «Відбори»: усі обрані групи + кілька поширених
  // (лише ті, що справді існують у цьому звіті).
  const filterKeys = [
    ...groups,
    ...commonFilters.filter((k) => dimKeys.has(k) && !groups.includes(k)),
  ];

  function moveGroup(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= groups.length) return;
    const next = [...groups];
    [next[i], next[j]] = [next[j]!, next[i]!];
    setGroups(next);
  }

  function removeGroup(key: string) {
    setGroups(groups.filter((g) => g !== key));
  }

  function addGroup() {
    if (addKey && !groups.includes(addKey)) {
      setGroups([...groups, addKey]);
      setAddKey("");
    }
  }

  function toggleIndicator(key: string, on: boolean) {
    setInd(on ? [...ind, key] : ind.filter((k) => k !== key));
  }

  function toggleAttr(key: string, on: boolean) {
    setAttrs((prev) => (on ? [...prev, key] : prev.filter((k) => k !== key)));
  }

  function setFilter(key: string, value: string) {
    setFilters((f) => ({ ...f, [key]: value }));
  }

  function submit() {
    const sp = new URLSearchParams(searchParams.toString());
    // Скидаємо керовані параметри.
    sp.delete("from");
    sp.delete("to");
    sp.delete("groups");
    sp.delete("ind");
    sp.delete("totals");
    sp.delete("cols");
    for (const d of dimensions) sp.delete(`f_${d.key}`);

    if (!hideFrom && from.trim()) sp.set("from", from.trim());
    if (to.trim()) sp.set("to", to.trim());
    if (groups.length) sp.set("groups", groups.join(","));
    if (ind.length) sp.set("ind", ind.join(","));
    if (!totals) sp.set("totals", "0");
    if (attrOptions && attrs.length) sp.set("cols", attrs.join(","));
    for (const [k, v] of Object.entries(filters)) {
      if (v.trim()) sp.set(`f_${k}`, v.trim());
    }
    // Прапорець «сформовано» — сторінка рахує звіт лише після цього (легкий старт).
    sp.set("go", "1");
    startTransition(() => router.push(`${pathname}?${sp.toString()}`));
  }

  function reset() {
    startTransition(() => router.push(pathname));
  }

  return (
    <div className="space-y-4 rounded-lg border border-gray-200 bg-white p-4">
      {/* Період */}
      <div className="flex flex-wrap items-end gap-2">
        {!hideFrom && (
          <label className="flex flex-col gap-0.5">
            <span className="text-xs text-gray-500">Період з</span>
            <Input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="h-8 w-36 text-sm"
            />
          </label>
        )}
        <label className="flex flex-col gap-0.5">
          <span className="text-xs text-gray-500">
            {hideFrom ? "Станом на" : "по"}
          </span>
          <Input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="h-8 w-36 text-sm"
          />
        </label>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Групування рядків */}
        <div>
          <h3 className="mb-2 text-sm font-medium text-gray-800">
            Групування рядків
          </h3>
          <ul className="divide-y divide-gray-100 rounded-md border bg-white">
            {groups.length === 0 && (
              <li className="px-3 py-2 text-xs text-gray-400">
                Без групування (лише загальний підсумок)
              </li>
            )}
            {groups.map((key, i) => (
              <li
                key={key}
                className="flex items-center gap-2 px-3 py-2 text-sm"
              >
                <div className="flex flex-col">
                  <button
                    type="button"
                    aria-label={`Перемістити ${dimLabel.get(key)} вгору`}
                    disabled={i === 0}
                    onClick={() => moveGroup(i, -1)}
                    className="rounded p-0.5 text-xs hover:bg-gray-100 disabled:opacity-30"
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    aria-label={`Перемістити ${dimLabel.get(key)} вниз`}
                    disabled={i === groups.length - 1}
                    onClick={() => moveGroup(i, 1)}
                    className="rounded p-0.5 text-xs hover:bg-gray-100 disabled:opacity-30"
                  >
                    ▼
                  </button>
                </div>
                <span className="flex-1 truncate text-gray-800">
                  {i + 1}. {dimLabel.get(key)}
                </span>
                <button
                  type="button"
                  aria-label={`Прибрати ${dimLabel.get(key)}`}
                  onClick={() => removeGroup(key)}
                  className="rounded px-1.5 py-0.5 text-xs text-red-600 hover:bg-red-50"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
          {available.length > 0 && (
            <div className="mt-2 flex items-center gap-2">
              <select
                value={addKey}
                onChange={(e) => setAddKey(e.target.value)}
                className="h-8 flex-1 rounded-md border border-gray-300 px-2 text-sm text-gray-800 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              >
                <option value="">+ Додати вимір…</option>
                {available.map((d) => (
                  <option key={d.key} value={d.key}>
                    {d.label}
                  </option>
                ))}
              </select>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={addGroup}
                disabled={!addKey}
                className="h-8"
              >
                Додати
              </Button>
            </div>
          )}
        </div>

        {/* Показники */}
        <div>
          <h3 className="mb-2 text-sm font-medium text-gray-800">Показники</h3>
          <ul className="space-y-1 rounded-md border bg-white p-2">
            {indicators.map((m) => (
              <li key={m.key} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  id={`ind-${m.key}`}
                  checked={ind.includes(m.key)}
                  onChange={(e) => toggleIndicator(m.key, e.target.checked)}
                />
                <label htmlFor={`ind-${m.key}`} className="text-gray-800">
                  {m.label}
                </label>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Колонки товару (стиль 1С «Остатки товаров») — лише коли передано attrOptions */}
      {attrOptions && attrOptions.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-medium text-gray-800">Колонки</h3>
          <ul className="grid gap-1 rounded-md border bg-white p-2 sm:grid-cols-2 md:grid-cols-3">
            {attrOptions.map((c) => (
              <li key={c.key} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  id={`col-${c.key}`}
                  checked={attrs.includes(c.key)}
                  onChange={(e) => toggleAttr(c.key, e.target.checked)}
                />
                <label htmlFor={`col-${c.key}`} className="text-gray-800">
                  {c.label}
                </label>
              </li>
            ))}
          </ul>
          <p className="mt-1 text-xs text-gray-400">
            Довідкові колонки показуються лише на рядках одного товару.
          </p>
        </div>
      )}

      {/* Відбори */}
      <div>
        <h3 className="mb-2 text-sm font-medium text-gray-800">Відбори</h3>
        <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
          {filterKeys.map((key) => (
            <label key={key} className="flex flex-col gap-0.5">
              <span className="text-xs text-gray-500">{dimLabel.get(key)}</span>
              <Input
                type="text"
                placeholder="містить…"
                value={filters[key] ?? ""}
                onChange={(e) => setFilter(key, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") submit();
                }}
                className="h-8 text-sm"
              />
            </label>
          ))}
        </div>
      </div>

      {/* Дії */}
      <div className="flex flex-wrap items-center gap-3 border-t border-gray-100 pt-3">
        <label className="flex items-center gap-2 text-sm text-gray-800">
          <input
            type="checkbox"
            checked={totals}
            onChange={(e) => setTotals(e.target.checked)}
          />
          Загальні підсумки
        </label>
        <div className="ml-auto flex items-center gap-2">
          {isPending && (
            <span className="flex items-center gap-1.5 text-sm text-gray-500">
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-gray-300 border-t-emerald-600" />
              Формування…
            </span>
          )}
          <Button
            type="button"
            size="sm"
            onClick={submit}
            disabled={isPending}
            className="h-8"
          >
            {isPending ? "Формування…" : "Сформувати"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={reset}
            disabled={isPending}
            className="h-8"
          >
            Скинути
          </Button>
        </div>
      </div>
    </div>
  );
}
