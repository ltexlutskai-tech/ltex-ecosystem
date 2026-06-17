"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

interface ClientHit {
  id: string;
  name: string;
}

/**
 * Простий пошук-пікер контрагента для акту звірки.
 * Запит до `/api/v1/manager/clients/search-all`; вибір → навігація з `?clientId=`
 * (зберігаючи період from/to у URL).
 */
export function ReconClientPicker({
  initialName,
}: {
  initialName: string | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(initialName ?? "");
  const [hits, setHits] = useState<ClientHit[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = query.trim();
    if (q.length < 2) {
      setHits([]);
      return;
    }
    debounceRef.current = setTimeout(() => {
      setLoading(true);
      fetch(`/api/v1/manager/clients/search-all?q=${encodeURIComponent(q)}`)
        .then((r) => (r.ok ? r.json() : { items: [] }))
        .then((data: { items?: ClientHit[] }) => {
          setHits(Array.isArray(data.items) ? data.items.slice(0, 20) : []);
        })
        .catch(() => setHits([]))
        .finally(() => setLoading(false));
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  function select(hit: ClientHit) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("clientId", hit.id);
    setQuery(hit.name);
    setOpen(false);
    router.push(`/manager/reports/reconciliation?${params.toString()}`);
  }

  return (
    <div className="relative">
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-gray-600">Контрагент</span>
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Почніть вводити назву…"
          className="w-72 rounded-md border border-gray-300 px-2 py-1.5 text-sm"
        />
      </label>
      {open && (loading || hits.length > 0) && (
        <ul className="absolute z-10 mt-1 max-h-64 w-72 overflow-y-auto rounded-md border border-gray-200 bg-white shadow-lg">
          {loading && (
            <li className="px-3 py-2 text-sm text-gray-400">Пошук…</li>
          )}
          {hits.map((hit) => (
            <li key={hit.id}>
              <button
                type="button"
                onClick={() => select(hit)}
                className="block w-full px-3 py-2 text-left text-sm hover:bg-emerald-50"
              >
                {hit.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
