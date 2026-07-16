"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Bookmark, Check, Star, X } from "lucide-react";

/**
 * «Мої вибірки» — збережені набори фільтрів списку клієнтів. Менеджер зберігає
 * поточний набір фільтрів під назвою й застосовує одним кліком. Зберігається
 * локально в браузері робочого місця (localStorage) — без БД/деплою.
 * `window.prompt` заблокований у вкладках-iframe, тому назва вводиться inline.
 */

interface Preset {
  name: string;
  query: string;
}

const LS_KEY = "ltex:client-filter-presets";
// Параметри, що НЕ є фільтром (не зберігаємо у вибірці).
const NON_FILTER_PARAMS = new Set(["page", "pageSize"]);

function loadPresets(): Preset[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (p): p is Preset =>
        !!p &&
        typeof (p as Preset).name === "string" &&
        typeof (p as Preset).query === "string",
    );
  } catch {
    return [];
  }
}

function savePresets(list: Preset[]) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(list));
  } catch {
    // ignore quota/parse
  }
}

/** Поточні фільтр-параметри URL (без page/pageSize) → нормалізований query. */
function currentFilterQuery(sp: URLSearchParams): string {
  const out = new URLSearchParams();
  const keys = Array.from(sp.keys()).sort();
  for (const k of keys) {
    if (NON_FILTER_PARAMS.has(k)) continue;
    const v = sp.get(k);
    if (v) out.set(k, v);
  }
  return out.toString();
}

export function ClientFilterPresets() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const [presets, setPresets] = useState<Preset[]>([]);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");

  useEffect(() => {
    setPresets(loadPresets());
  }, []);

  const currentQuery = currentFilterQuery(
    new URLSearchParams(searchParams.toString()),
  );
  const hasActiveFilters = currentQuery.length > 0;

  function apply(query: string) {
    startTransition(() =>
      router.push(query ? `${pathname}?${query}` : pathname),
    );
  }

  function saveCurrent() {
    const n = name.trim();
    if (!n || !hasActiveFilters) return;
    const next = [
      ...presets.filter((p) => p.name !== n),
      { name: n, query: currentQuery },
    ];
    setPresets(next);
    savePresets(next);
    setName("");
    setAdding(false);
  }

  function remove(n: string) {
    const next = presets.filter((p) => p.name !== n);
    setPresets(next);
    savePresets(next);
  }

  const activeName =
    presets.find((p) => p.query === currentQuery)?.name ?? null;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="mr-1 flex items-center gap-1 text-xs text-gray-400">
        <Bookmark className="h-3.5 w-3.5" /> Вибірки:
      </span>

      {presets.length === 0 && !adding && (
        <span className="text-xs text-gray-400">
          збережіть поточні фільтри для швидкого доступу
        </span>
      )}

      {presets.map((p) => (
        <span
          key={p.name}
          className={
            p.name === activeName
              ? "inline-flex items-center gap-1 rounded-full border border-green-600 bg-green-50 px-2.5 py-1 text-xs text-green-800"
              : "inline-flex items-center gap-1 rounded-full border bg-white px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-50"
          }
        >
          <button
            type="button"
            onClick={() => apply(p.query)}
            className="flex items-center gap-1"
            title="Застосувати вибірку"
          >
            {p.name === activeName ? (
              <Check className="h-3 w-3" />
            ) : (
              <Star className="h-3 w-3 text-amber-400" />
            )}
            {p.name}
          </button>
          <button
            type="button"
            aria-label={`Видалити вибірку ${p.name}`}
            className="text-gray-400 hover:text-red-600"
            onClick={() => remove(p.name)}
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}

      {adding ? (
        <span className="inline-flex items-center gap-1">
          <input
            type="text"
            value={name}
            autoFocus
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                saveCurrent();
              }
              if (e.key === "Escape") setAdding(false);
            }}
            placeholder="Назва вибірки"
            maxLength={40}
            className="h-7 w-40 rounded-md border px-2 text-xs"
          />
          <button
            type="button"
            onClick={saveCurrent}
            disabled={!name.trim()}
            className="rounded-md bg-green-600 px-2 py-1 text-xs text-white disabled:opacity-50"
          >
            Зберегти
          </button>
          <button
            type="button"
            onClick={() => setAdding(false)}
            className="rounded-md border px-2 py-1 text-xs text-gray-600"
          >
            Скасувати
          </button>
        </span>
      ) : (
        hasActiveFilters && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="rounded-full border border-dashed px-2.5 py-1 text-xs text-gray-600 hover:bg-gray-50"
          >
            + Зберегти поточні
          </button>
        )
      )}
    </div>
  );
}
