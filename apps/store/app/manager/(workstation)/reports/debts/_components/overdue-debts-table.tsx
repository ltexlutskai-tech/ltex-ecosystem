"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { OverdueDebtRow, OverdueDoc } from "@/lib/reports/overdue-debts";

function eur(n: number | null): string {
  if (n == null) return "—";
  return `${n.toLocaleString("uk-UA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} €`;
}

function fmtDate(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("uk-UA");
}

type SortKey =
  | "name"
  | "debtEur"
  | "overdueEur"
  | "oldestOverdueDays"
  | "individualTermDays"
  | "activity"
  | "agentName";
type SortDir = "asc" | "desc";

const ACTIVITY_OPTIONS = [
  { value: "", label: "Усі" },
  { value: "Претензійна робота!", label: "Претензійна робота!" },
  { value: "Організувати проплату!", label: "Організувати проплату!" },
  { value: "none", label: "— (без)" },
] as const;

export function OverdueDebtsTable({ rows }: { rows: OverdueDebtRow[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("debtEur");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Фільтри.
  const [fName, setFName] = useState("");
  const [fDaysMin, setFDaysMin] = useState("");
  const [fDaysMax, setFDaysMax] = useState("");
  const [fActivity, setFActivity] = useState("");
  const [fAgent, setFAgent] = useState("");

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(
        key === "name" || key === "agentName" || key === "activity"
          ? "asc"
          : "desc",
      );
    }
  }

  function toggleExpand(clientId: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(clientId)) next.delete(clientId);
      else next.add(clientId);
      return next;
    });
  }

  function resetFilters() {
    setFName("");
    setFDaysMin("");
    setFDaysMax("");
    setFActivity("");
    setFAgent("");
  }

  const filtered = useMemo(() => {
    const nameQ = fName.trim().toLowerCase();
    const agentQ = fAgent.trim().toLowerCase();
    const min = fDaysMin.trim() === "" ? null : Number(fDaysMin);
    const max = fDaysMax.trim() === "" ? null : Number(fDaysMax);
    return rows.filter((r) => {
      if (nameQ && !r.name.toLowerCase().includes(nameQ)) return false;
      if (agentQ && !(r.agentName ?? "").toLowerCase().includes(agentQ))
        return false;
      if (min != null && !Number.isNaN(min) && r.oldestOverdueDays < min)
        return false;
      if (max != null && !Number.isNaN(max) && r.oldestOverdueDays > max)
        return false;
      if (fActivity === "none") {
        if (r.activity !== "") return false;
      } else if (fActivity && r.activity !== fActivity) {
        return false;
      }
      return true;
    });
  }, [rows, fName, fAgent, fDaysMin, fDaysMax, fActivity]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "name":
          cmp = a.name.localeCompare(b.name, "uk");
          break;
        case "debtEur":
          cmp = a.debtEur - b.debtEur;
          break;
        case "overdueEur":
          cmp = a.overdueEur - b.overdueEur;
          break;
        case "oldestOverdueDays":
          cmp = a.oldestOverdueDays - b.oldestOverdueDays;
          break;
        case "individualTermDays": {
          // null сортується останнім (незалежно від напрямку).
          const av = a.individualTermDays;
          const bv = b.individualTermDays;
          if (av == null && bv == null) cmp = 0;
          else if (av == null) return 1;
          else if (bv == null) return -1;
          else cmp = av - bv;
          break;
        }
        case "activity":
          cmp = a.activity.localeCompare(b.activity, "uk");
          break;
        case "agentName":
          cmp = (a.agentName ?? "").localeCompare(b.agentName ?? "", "uk");
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3 rounded-md border bg-white p-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-gray-600">Контрагент</span>
          <input
            value={fName}
            onChange={(e) => setFName(e.target.value)}
            placeholder="містить…"
            className="w-44 rounded-md border border-gray-300 px-2 py-1.5 text-sm"
          />
        </label>
        <div className="flex flex-col gap-1 text-sm">
          <span className="text-gray-600">Днів (від / до)</span>
          <div className="flex items-center gap-1">
            <input
              value={fDaysMin}
              onChange={(e) => setFDaysMin(e.target.value)}
              type="number"
              min={0}
              placeholder="мін"
              className="w-20 rounded-md border border-gray-300 px-2 py-1.5 text-sm"
            />
            <span className="text-gray-400">–</span>
            <input
              value={fDaysMax}
              onChange={(e) => setFDaysMax(e.target.value)}
              type="number"
              min={0}
              placeholder="макс"
              className="w-20 rounded-md border border-gray-300 px-2 py-1.5 text-sm"
            />
          </div>
        </div>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-gray-600">Діяльність</span>
          <select
            value={fActivity}
            onChange={(e) => setFActivity(e.target.value)}
            className="w-48 rounded-md border border-gray-300 px-2 py-1.5 text-sm"
          >
            {ACTIVITY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-gray-600">Торговий агент</span>
          <input
            value={fAgent}
            onChange={(e) => setFAgent(e.target.value)}
            placeholder="містить…"
            className="w-44 rounded-md border border-gray-300 px-2 py-1.5 text-sm"
          />
        </label>
        <button
          type="button"
          onClick={resetFilters}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Скинути фільтри
        </button>
      </div>

      <div className="overflow-x-auto rounded-md border bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <SortHeader
                label="Контрагент"
                col="name"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={toggleSort}
              />
              <SortHeader
                label="Борг €"
                col="debtEur"
                align="right"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={toggleSort}
              />
              <SortHeader
                label="Прострочений борг €"
                col="overdueEur"
                align="right"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={toggleSort}
              />
              <SortHeader
                label="Днів"
                col="oldestOverdueDays"
                align="right"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={toggleSort}
              />
              <SortHeader
                label="Відстрочка, дн."
                col="individualTermDays"
                align="right"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={toggleSort}
              />
              <SortHeader
                label="Діяльність"
                col="activity"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={toggleSort}
              />
              <SortHeader
                label="Торговий агент"
                col="agentName"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={toggleSort}
              />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {sorted.map((r) => {
              const openDocs = r.docs.filter((d) => d.remaining > 0);
              const isOpen = expanded.has(r.clientId);
              return (
                <FragmentRow
                  key={r.clientId}
                  row={r}
                  openDocs={openDocs}
                  isOpen={isOpen}
                  onToggle={() => toggleExpand(r.clientId)}
                />
              );
            })}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-gray-400">
                  Нічого не знайдено за фільтрами.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FragmentRow({
  row: r,
  openDocs,
  isOpen,
  onToggle,
}: {
  row: OverdueDebtRow;
  openDocs: OverdueDoc[];
  isOpen: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <tr className={r.isOverdue ? "bg-red-50" : "hover:bg-gray-50"}>
        <td className="px-3 py-2">
          <Link
            href={`/manager/customers/${r.clientId}`}
            className="text-emerald-700 hover:underline"
          >
            {r.name}
          </Link>
        </td>
        <td className="px-3 py-2 text-right tabular-nums">
          <Link
            href={`/manager/registry/debt?clientId=${r.clientId}`}
            className="text-emerald-700 hover:underline"
          >
            {eur(r.debtEur)}
          </Link>
        </td>
        <td className="px-3 py-2 text-right tabular-nums">
          {openDocs.length > 0 ? (
            <button
              type="button"
              onClick={onToggle}
              className="font-medium text-red-700 hover:underline"
              aria-expanded={isOpen}
            >
              {eur(r.overdueEur)} {isOpen ? "▴" : "▾"}
            </button>
          ) : (
            <span>{eur(r.overdueEur)}</span>
          )}
        </td>
        <td className="px-3 py-2 text-right tabular-nums">
          {r.oldestOverdueDays > 0 ? r.oldestOverdueDays : ""}
        </td>
        <td className="px-3 py-2 text-right tabular-nums">
          {r.individualTermDays != null ? r.individualTermDays : "—"}
        </td>
        <td className="px-3 py-2">
          {r.activity && (
            <span className="font-medium text-red-700">{r.activity}</span>
          )}
        </td>
        <td className="px-3 py-2">{r.agentName ?? ""}</td>
      </tr>
      {isOpen && openDocs.length > 0 && (
        <tr>
          <td colSpan={7} className="bg-gray-50 px-3 py-3">
            <div className="overflow-x-auto rounded-md border bg-white">
              <table className="w-full text-xs">
                <thead className="bg-gray-100 text-left uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-2 py-1.5">Накладна</th>
                    <th className="px-2 py-1.5">Дата</th>
                    <th className="px-2 py-1.5 text-right">Сума €</th>
                    <th className="px-2 py-1.5 text-right">
                      Борг по накладній €
                    </th>
                    <th className="px-2 py-1.5 text-right">Днів</th>
                    <th className="px-2 py-1.5 text-right">Прострочено днів</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {openDocs.map((d, i) => (
                    <tr
                      key={`${d.recorderHex ?? "x"}-${i}`}
                      className={d.daysOverdue > 0 ? "bg-red-50" : ""}
                    >
                      <td className="px-2 py-1.5">
                        {d.saleId ? (
                          <Link
                            href={`/manager/sales/${d.saleId}`}
                            className="text-emerald-700 hover:underline"
                          >
                            {d.label}
                          </Link>
                        ) : (
                          <span className="text-gray-600">{d.label}</span>
                        )}
                      </td>
                      <td className="px-2 py-1.5">{fmtDate(d.date)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">
                        {eur(d.docTotalEur)}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums">
                        {eur(d.remaining)}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums">
                        {d.days}
                      </td>
                      <td
                        className={`px-2 py-1.5 text-right tabular-nums ${
                          d.daysOverdue > 0 ? "font-medium text-red-700" : ""
                        }`}
                      >
                        {d.daysOverdue > 0 ? d.daysOverdue : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function SortHeader({
  label,
  col,
  align,
  sortKey,
  sortDir,
  onSort,
}: {
  label: string;
  col: SortKey;
  align?: "right";
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (key: SortKey) => void;
}) {
  const active = sortKey === col;
  return (
    <th className={`px-3 py-2 ${align === "right" ? "text-right" : ""}`}>
      <button
        type="button"
        onClick={() => onSort(col)}
        className={`inline-flex items-center gap-1 uppercase tracking-wide ${
          active ? "text-gray-900" : "text-gray-500"
        } hover:text-gray-900`}
      >
        {label}
        {active && <span>{sortDir === "asc" ? "▴" : "▾"}</span>}
      </button>
    </th>
  );
}
