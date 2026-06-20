"use client";

import { type ReactNode } from "react";
import Link from "next/link";
import { Download } from "lucide-react";
import { Button } from "@ltex/ui";

/** Клітинка-посилання: рендериться як `<Link>`, у CSV йде `text`. */
export interface LinkCell {
  text: string;
  href: string;
}

function isLinkCell(v: unknown): v is LinkCell {
  return (
    typeof v === "object" &&
    v !== null &&
    typeof (v as LinkCell).href === "string" &&
    typeof (v as LinkCell).text === "string"
  );
}

export interface RegisterColumn {
  /** Ключ поля у рядку. */
  key: string;
  /** Заголовок колонки. */
  label: string;
  /** Вирівнювання значення. */
  align?: "left" | "right" | "center";
  /** Не переносити (whitespace-nowrap). */
  nowrap?: boolean;
  /** Кастомний рендер клітинки. */
  render?: (row: Record<string, unknown>) => ReactNode;
}

export interface RegisterViewerProps {
  columns: RegisterColumn[];
  rows: Record<string, unknown>[];
  /** Слот фільтрів над таблицею. */
  filters?: ReactNode;
  /** Слот підсумкового рядка під таблицею. */
  summary?: ReactNode;
  /** Ім'я файла CSV (без розширення). */
  csvFilename: string;
  /** Текст для порожнього стану. */
  emptyMessage?: string;
}

/**
 * Загальний переглядач рухів регістру (патерн для всіх регістрів менеджерки).
 * У Фазі 2 нові регістри підключаються лише передачею `columns` + `rows`.
 */
export function RegisterViewer({
  columns,
  rows,
  filters,
  summary,
  csvFilename,
  emptyMessage = "Рухів за обраними фільтрами немає.",
}: RegisterViewerProps) {
  function exportCsv() {
    const sep = ";";
    const header = columns.map((c) => csvCell(c.label)).join(sep);
    const lines = rows.map((row) =>
      columns.map((c) => csvCell(cellText(c, row))).join(sep),
    );
    // BOM (﻿) щоб Excel розпізнав UTF-8.
    const content = "﻿" + [header, ...lines].join("\r\n");
    const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${csvFilename}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-3">
      {(filters || rows.length > 0) && (
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex-1">{filters}</div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={exportCsv}
            disabled={rows.length === 0}
            className="gap-1.5"
          >
            <Download className="h-4 w-4" />
            Експорт CSV
          </Button>
        </div>
      )}

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-6 py-10 text-center text-sm text-gray-500">
          {emptyMessage}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
              <tr>
                {columns.map((c) => (
                  <th
                    key={c.key}
                    className={`px-2.5 py-1.5 font-medium ${alignClass(c.align)}`}
                  >
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((row, i) => (
                <tr key={String(row.id ?? i)} className="hover:bg-gray-50/60">
                  {columns.map((c) => (
                    <td
                      key={c.key}
                      className={`px-2.5 py-1.5 text-gray-700 ${alignClass(
                        c.align,
                      )} ${c.nowrap ? "whitespace-nowrap" : ""}`}
                    >
                      {c.render
                        ? c.render(row)
                        : isLinkCell(row[c.key])
                          ? (() => {
                              const lc = row[c.key] as LinkCell;
                              return (
                                <Link
                                  href={lc.href}
                                  className="font-mono text-blue-600 hover:text-blue-700 hover:underline"
                                >
                                  {lc.text}
                                </Link>
                              );
                            })()
                          : cellText(c, row)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {summary}
    </div>
  );
}

function alignClass(align?: "left" | "right" | "center"): string {
  if (align === "right") return "text-right";
  if (align === "center") return "text-center";
  return "text-left";
}

/** Текстове значення клітинки (для відображення без render + для CSV). */
function cellText(c: RegisterColumn, row: Record<string, unknown>): string {
  const v = row[c.key];
  if (v === null || v === undefined) return "";
  if (isLinkCell(v)) return v.text;
  return String(v);
}

/** Екранування значення для CSV (`;`-роздільник, подвоєння лапок). */
function csvCell(value: string): string {
  if (/[",;\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
