"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, ChevronDown, ChevronRight } from "lucide-react";
import { SaleStatusBadge } from "../../../sales/_components/sale-status-badge";
import { formatDocNumber } from "@/lib/manager/order-number";

export interface ClientSaleItemRow {
  id: string;
  articleCode: string | null;
  productName: string | null;
  quantity: number;
  weight: number;
  /** Ціна за кг, €. */
  pricePerKg: number;
  /** Сума рядка, €. */
  priceEur: number;
  /** Курс € документа (для показу суми у ₴). */
  exchangeRateEur: number;
}

export interface ClientSaleRowData {
  id: string;
  code1C: string | null;
  number1C: string | null;
  docNumber: number;
  status: string;
  totalEur: number;
  totalUah: number;
  itemCount: number;
  createdAt: Date;
  items: ClientSaleItemRow[];
}

function money(uah: number): string {
  return `${Math.round(uah).toLocaleString("uk-UA")} ₴`;
}

export function ClientSalesHistoryList({
  sales,
}: {
  sales: ClientSaleRowData[];
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (sales.length === 0) return null;
  return (
    <div className="overflow-x-auto rounded-lg border bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-gray-50 text-left text-xs tracking-wide text-gray-500 uppercase">
            <th className="w-8 px-2.5 py-1.5 font-medium"></th>
            <th className="px-2.5 py-1.5 font-medium">№</th>
            <th className="px-2.5 py-1.5 font-medium">Дата</th>
            <th className="px-2.5 py-1.5 font-medium">Статус</th>
            <th className="px-2.5 py-1.5 text-center font-medium">Позицій</th>
            <th className="px-2.5 py-1.5 text-right font-medium">Сума</th>
            <th className="w-12 px-2.5 py-1.5 font-medium"></th>
          </tr>
        </thead>
        <tbody>
          {sales.map((s) => {
            const isOpen = expanded.has(s.id);
            return (
              <SaleRows
                key={s.id}
                sale={s}
                isOpen={isOpen}
                onToggle={() => toggle(s.id)}
              />
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function SaleRows({
  sale: s,
  isOpen,
  onToggle,
}: {
  sale: ClientSaleRowData;
  isOpen: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <tr className="border-b last:border-b-0 hover:bg-gray-50">
        <td className="px-2.5 py-1.5">
          <button
            type="button"
            onClick={onToggle}
            aria-label={isOpen ? "Згорнути товари" : "Показати товари"}
            aria-expanded={isOpen}
            className="rounded p-0.5 text-gray-500 hover:bg-gray-200 hover:text-gray-800"
          >
            {isOpen ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </button>
        </td>
        <td className="px-2.5 py-1.5 font-mono text-sm text-gray-700">
          <Link href={`/manager/sales/${s.id}`} className="hover:text-blue-600">
            {formatDocNumber(s)}
          </Link>
        </td>
        <td className="px-2.5 py-1.5 text-sm whitespace-nowrap text-gray-600">
          {new Date(s.createdAt).toLocaleDateString("uk-UA")}
        </td>
        <td className="px-2.5 py-1.5">
          <SaleStatusBadge status={s.status} />
        </td>
        <td className="px-2.5 py-1.5 text-center text-sm whitespace-nowrap text-gray-700">
          {s.itemCount}
        </td>
        <td className="px-2.5 py-1.5 text-right text-sm font-medium whitespace-nowrap text-gray-800">
          {money(s.totalUah)}
        </td>
        <td className="px-2.5 py-1.5 text-right">
          <Link
            href={`/manager/sales/${s.id}`}
            className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700"
            aria-label="Відкрити реалізацію"
          >
            <ArrowRight className="h-4 w-4" />
          </Link>
        </td>
      </tr>
      {isOpen && (
        <tr className="border-b last:border-b-0 bg-gray-50/60">
          <td colSpan={7} className="px-2.5 py-2">
            {s.items.length === 0 ? (
              <p className="px-2 py-1 text-xs text-gray-500">
                У документі немає позицій.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-md border bg-white">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b bg-gray-50 text-left text-[10px] tracking-wide text-gray-400 uppercase">
                      <th className="px-2 py-1 font-medium">Артикул</th>
                      <th className="px-2 py-1 font-medium">Товар</th>
                      <th className="px-2 py-1 text-center font-medium">
                        Мішків
                      </th>
                      <th className="px-2 py-1 text-right font-medium">
                        Вага, кг
                      </th>
                      <th className="px-2 py-1 text-right font-medium">
                        Ціна, €/кг
                      </th>
                      <th className="px-2 py-1 text-right font-medium">Сума</th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.items.map((it) => {
                      const sumUah =
                        it.exchangeRateEur > 0
                          ? it.priceEur * it.exchangeRateEur
                          : null;
                      return (
                        <tr
                          key={it.id}
                          className="border-b last:border-b-0 hover:bg-gray-50"
                        >
                          <td className="px-2 py-1 font-mono text-gray-500">
                            {it.articleCode ?? "—"}
                          </td>
                          <td className="px-2 py-1 text-gray-800">
                            {it.productName ?? "—"}
                          </td>
                          <td className="px-2 py-1 text-center text-gray-700">
                            {it.quantity}
                          </td>
                          <td className="px-2 py-1 text-right whitespace-nowrap text-gray-700">
                            {it.weight.toLocaleString("uk-UA", {
                              maximumFractionDigits: 1,
                            })}
                          </td>
                          <td className="px-2 py-1 text-right whitespace-nowrap text-gray-700">
                            {it.pricePerKg.toLocaleString("uk-UA", {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}{" "}
                            €
                          </td>
                          <td className="px-2 py-1 text-right font-medium whitespace-nowrap text-gray-800">
                            {sumUah !== null
                              ? money(sumUah)
                              : `${it.priceEur.toFixed(2)} €`}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
