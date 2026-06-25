"use client";

import { useState, useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Button, Input } from "@ltex/ui";
import { FILTER_OPS, type FilterOp } from "@/lib/reports/flex-filters";

/** Опис виміру/показника для UI (label з реєстру конкретного звіту). */
export interface OptionDef {
  key: string;
  label: string;
}

/** Один рядок відбору в UI (вимір + вид порівняння + значення). */
interface FilterRow {
  /** Стабільний локальний ключ для React-list (не серіалізується). */
  uid: number;
  dim: string;
  op: FilterOp;
  value: string;
}

/** Види, що НЕ потребують поля значення. */
function isValuelessOp(op: FilterOp): boolean {
  return op === "filled" || op === "empty";
}

/** Чи показувати datalist-combobox для значення при цьому виді порівняння. */
function opUsesDatalist(op: FilterOp): boolean {
  return op === "contains" || op === "eq" || op === "ne";
}

let _uidSeq = 0;
function nextUid(): number {
  return ++_uidSeq;
}

/**
 * Панель налаштувань гнучкого звіту (аналог 1С «Настройки»). Report-agnostic:
 * список вимірів і показників передається через props, тож той самий компонент
 * обслуговує усі 4 гнучкі звіти.
 *
 * Стан → URL-параметри (GET) при «Сформувати»:
 *   groups     — упорядкований CSV вимірів (рівні дерева)
 *   ind        — CSV показників
 *   cols       — CSV довідкових колонок товару (лише коли передано attrOptions)
 *   f_<dim>    — значення відбору по виміру
 *   fop_<dim>  — вид порівняння (пропускається коли «contains» — back-compat)
 *   totals     — 1/0 загальні підсумки
 */
export function FlexConfig({
  dimensions,
  indicators,
  initial,
  commonFilters = ["region", "agent", "client", "product"],
  hideFrom = false,
  attrOptions,
  initialAttrs = [],
  filterOptions = {},
}: {
  dimensions: OptionDef[];
  indicators: OptionDef[];
  initial: {
    from: string;
    to: string;
    groups: string[];
    indicators: string[];
    totals: boolean;
    /** dim → значення відбору. */
    filters: Record<string, string>;
    /** dim → вид порівняння (для ініціалізації рядків відбору). */
    filterOps?: Record<string, FilterOp>;
  };
  /**
   * Виміри-кандидати, які пропонуються першими у дропдауні «Поле» відбору
   * (решта вимірів теж доступні). Збережено для зворотної сумісності виклику.
   */
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
  /**
   * Distinct-значення на вимір (для combobox-відборів). Порожній масив для
   * виміру → лише вільний текст (висока кардинальність).
   */
  filterOptions?: Record<string, string[]>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const [open, setOpen] = useState(true);
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [groups, setGroups] = useState<string[]>(initial.groups);
  const [ind, setInd] = useState<string[]>(initial.indicators);
  const [totals, setTotals] = useState(initial.totals);
  const [attrs, setAttrs] = useState<string[]>(initialAttrs);
  const [addKey, setAddKey] = useState("");

  // Початкові рядки відбору з f_*/fop_*.
  const [filterRows, setFilterRows] = useState<FilterRow[]>(() =>
    Object.entries(initial.filters)
      .filter(([, v]) => v != null)
      .map(([dim, value]) => ({
        uid: nextUid(),
        dim,
        op: initial.filterOps?.[dim] ?? "contains",
        value,
      })),
  );

  const dimLabel = new Map(dimensions.map((d) => [d.key, d.label]));
  const available = dimensions.filter((d) => !groups.includes(d.key));

  // Виміри для дропдауна «Поле» відбору: commonFilters першими, далі решта.
  const orderedDims: OptionDef[] = [
    ...commonFilters
      .map((k) => dimensions.find((d) => d.key === k))
      .filter((d): d is OptionDef => Boolean(d)),
    ...dimensions.filter((d) => !commonFilters.includes(d.key)),
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

  function addFilterRow() {
    const firstDim = orderedDims[0]?.key ?? dimensions[0]?.key ?? "";
    setFilterRows((rows) => [
      ...rows,
      { uid: nextUid(), dim: firstDim, op: "contains", value: "" },
    ]);
  }

  function removeFilterRow(uid: number) {
    setFilterRows((rows) => rows.filter((r) => r.uid !== uid));
  }

  function patchFilterRow(uid: number, patch: Partial<FilterRow>) {
    setFilterRows((rows) =>
      rows.map((r) => (r.uid === uid ? { ...r, ...patch } : r)),
    );
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
    for (const d of dimensions) {
      sp.delete(`f_${d.key}`);
      sp.delete(`fop_${d.key}`);
    }

    if (!hideFrom && from.trim()) sp.set("from", from.trim());
    if (to.trim()) sp.set("to", to.trim());
    if (groups.length) sp.set("groups", groups.join(","));
    if (ind.length) sp.set("ind", ind.join(","));
    if (!totals) sp.set("totals", "0");
    if (attrOptions && attrs.length) sp.set("cols", attrs.join(","));

    // Відбори: лише з обраним виміром; значення обов'язкове крім filled/empty.
    // На один вимір серіалізуємо ОДИН (останній) рядок (URL-схема — по виміру).
    for (const r of filterRows) {
      if (!r.dim) continue;
      const valueless = isValuelessOp(r.op);
      if (!valueless && !r.value.trim()) continue;
      if (!valueless) sp.set(`f_${r.dim}`, r.value.trim());
      // Для filled/empty значення не потрібне — лишаємо лише прапор op.
      if (r.op !== "contains") sp.set(`fop_${r.dim}`, r.op);
      else sp.delete(`fop_${r.dim}`);
    }

    sp.set("go", "1");
    startTransition(() => router.push(`${pathname}?${sp.toString()}`));
  }

  function reset() {
    startTransition(() => router.push(pathname));
  }

  if (!open) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white px-3 py-2">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex items-center gap-1.5 text-sm font-medium text-gray-700 hover:text-emerald-700"
        >
          <span>⚙</span> Налаштування
          <span className="text-xs text-gray-400">(розгорнути)</span>
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border border-gray-200 bg-white p-3 text-sm">
      {/* Заголовок + згортання */}
      <div className="flex items-center justify-between border-b border-gray-100 pb-2">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="flex items-center gap-1.5 text-sm font-medium text-gray-700 hover:text-emerald-700"
        >
          <span>⚙</span> Налаштування
          <span className="text-xs text-gray-400">(згорнути)</span>
        </button>
      </div>

      {/* Період + Групування + Показники — щільна сітка */}
      <div className="grid gap-3 lg:grid-cols-3">
        {/* Період */}
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Період
          </h3>
          <div className="flex flex-wrap items-end gap-2">
            {!hideFrom && (
              <label className="flex flex-col gap-0.5">
                <span className="text-xs text-gray-500">з</span>
                <Input
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  className="h-8 w-32 text-xs"
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
                className="h-8 w-32 text-xs"
              />
            </label>
          </div>
          <label className="flex items-center gap-2 pt-1 text-xs text-gray-700">
            <input
              type="checkbox"
              checked={totals}
              onChange={(e) => setTotals(e.target.checked)}
            />
            Загальні підсумки
          </label>
        </div>

        {/* Групування рядків */}
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Групування рядків
          </h3>
          <ul className="divide-y divide-gray-100 rounded-md border bg-white">
            {groups.length === 0 && (
              <li className="px-2 py-1 text-xs text-gray-400">
                Без групування
              </li>
            )}
            {groups.map((key, i) => (
              <li
                key={key}
                className="flex items-center gap-1.5 px-2 py-1 text-xs"
              >
                <div className="flex">
                  <button
                    type="button"
                    aria-label={`Перемістити ${dimLabel.get(key)} вгору`}
                    disabled={i === 0}
                    onClick={() => moveGroup(i, -1)}
                    className="rounded px-0.5 hover:bg-gray-100 disabled:opacity-30"
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    aria-label={`Перемістити ${dimLabel.get(key)} вниз`}
                    disabled={i === groups.length - 1}
                    onClick={() => moveGroup(i, 1)}
                    className="rounded px-0.5 hover:bg-gray-100 disabled:opacity-30"
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
                  className="rounded px-1 text-red-600 hover:bg-red-50"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
          {available.length > 0 && (
            <div className="flex items-center gap-1.5">
              <select
                value={addKey}
                onChange={(e) => setAddKey(e.target.value)}
                className="h-8 flex-1 rounded-md border border-gray-300 px-1.5 text-xs text-gray-800 focus:outline-none focus:ring-1 focus:ring-emerald-500"
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
                className="h-8 px-2 text-xs"
              >
                +
              </Button>
            </div>
          )}
        </div>

        {/* Показники */}
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Показники
          </h3>
          <ul className="grid grid-cols-1 gap-0.5 rounded-md border bg-white p-1.5 sm:grid-cols-2 lg:grid-cols-1">
            {indicators.map((m) => (
              <li key={m.key} className="flex items-center gap-1.5 text-xs">
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

          {/* Колонки товару (1С «Остатки товаров») — лише коли передано */}
          {attrOptions && attrOptions.length > 0 && (
            <div className="space-y-1">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Колонки
              </h3>
              <ul className="grid grid-cols-2 gap-0.5 rounded-md border bg-white p-1.5">
                {attrOptions.map((c) => (
                  <li key={c.key} className="flex items-center gap-1.5 text-xs">
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
            </div>
          )}
        </div>
      </div>

      {/* Відбори — компактна таблиця у стилі 1С «Відбір» */}
      <div className="space-y-1.5">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          Відбори
        </h3>
        {filterRows.length > 0 && (
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 text-left text-gray-500">
                <tr>
                  <th className="px-2 py-1 font-medium">Поле</th>
                  <th className="px-2 py-1 font-medium">Вид порівняння</th>
                  <th className="px-2 py-1 font-medium">Значення</th>
                  <th className="w-8 px-2 py-1" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filterRows.map((r) => {
                  const opts = filterOptions[r.dim] ?? [];
                  const hasOpts = opts.length > 0;
                  const listId = `flt-${r.uid}`;
                  return (
                    <tr key={r.uid}>
                      <td className="px-2 py-1">
                        <select
                          aria-label="Поле відбору"
                          value={r.dim}
                          onChange={(e) =>
                            patchFilterRow(r.uid, { dim: e.target.value })
                          }
                          className="h-8 w-full rounded border border-gray-300 px-1.5 text-xs text-gray-800 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                        >
                          {orderedDims.map((d) => (
                            <option key={d.key} value={d.key}>
                              {d.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-2 py-1">
                        <select
                          aria-label="Вид порівняння"
                          value={r.op}
                          onChange={(e) =>
                            patchFilterRow(r.uid, {
                              op: e.target.value as FilterOp,
                            })
                          }
                          className="h-8 w-full rounded border border-gray-300 px-1.5 text-xs text-gray-800 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                        >
                          {FILTER_OPS.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-2 py-1">
                        {isValuelessOp(r.op) ? (
                          <span className="text-gray-400">—</span>
                        ) : opUsesDatalist(r.op) && hasOpts ? (
                          <>
                            <Input
                              type="text"
                              list={listId}
                              value={r.value}
                              placeholder="оберіть або введіть…"
                              onChange={(e) =>
                                patchFilterRow(r.uid, { value: e.target.value })
                              }
                              onKeyDown={(e) => {
                                if (e.key === "Enter") submit();
                              }}
                              className="h-8 text-xs"
                            />
                            <datalist id={listId}>
                              {opts.map((v) => (
                                <option key={v} value={v} />
                              ))}
                            </datalist>
                          </>
                        ) : r.op === "in" || r.op === "nin" ? (
                          <>
                            <Input
                              type="text"
                              list={hasOpts ? listId : undefined}
                              value={r.value}
                              placeholder="значення через кому"
                              onChange={(e) =>
                                patchFilterRow(r.uid, { value: e.target.value })
                              }
                              onKeyDown={(e) => {
                                if (e.key === "Enter") submit();
                              }}
                              className="h-8 text-xs"
                            />
                            {hasOpts && (
                              <datalist id={listId}>
                                {opts.map((v) => (
                                  <option key={v} value={v} />
                                ))}
                              </datalist>
                            )}
                          </>
                        ) : (
                          <Input
                            type="text"
                            value={r.value}
                            placeholder="значення"
                            onChange={(e) =>
                              patchFilterRow(r.uid, { value: e.target.value })
                            }
                            onKeyDown={(e) => {
                              if (e.key === "Enter") submit();
                            }}
                            className="h-8 text-xs"
                          />
                        )}
                      </td>
                      <td className="px-2 py-1 text-center">
                        <button
                          type="button"
                          aria-label="Прибрати відбір"
                          onClick={() => removeFilterRow(r.uid)}
                          className="rounded px-1 text-red-600 hover:bg-red-50"
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={addFilterRow}
          className="h-7 px-2 text-xs"
        >
          + Відбір
        </Button>
      </div>

      {/* Дії */}
      <div className="flex flex-wrap items-center gap-2 border-t border-gray-100 pt-2">
        <div className="ml-auto flex items-center gap-2">
          {isPending && (
            <span className="flex items-center gap-1.5 text-xs text-gray-500">
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
