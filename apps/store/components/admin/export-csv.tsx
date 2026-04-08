"use client";

import { Download } from "lucide-react";

interface ExportCsvButtonProps {
  data: Record<string, string | number>[];
  filename: string;
  headers: string[];
}

export function ExportCsvButton({
  data,
  filename,
  headers,
}: ExportCsvButtonProps) {
  function handleExport() {
    const headerRow = headers.join(",");
    const rows = data.map((row) =>
      headers
        .map((h) => {
          const val = String(row[h] ?? "");
          // Escape values containing commas, quotes, or newlines
          if (val.includes(",") || val.includes('"') || val.includes("\n")) {
            return `"${val.replace(/"/g, '""')}"`;
          }
          return val;
        })
        .join(","),
    );

    const csv = "\uFEFF" + [headerRow, ...rows].join("\n"); // BOM for Excel UTF-8
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${filename}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <button
      onClick={handleExport}
      className="inline-flex items-center gap-1.5 rounded-md border bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
    >
      <Download className="h-4 w-4" />
      Експорт CSV
    </button>
  );
}
