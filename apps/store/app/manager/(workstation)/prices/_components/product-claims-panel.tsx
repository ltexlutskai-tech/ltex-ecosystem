"use client";

import { useState } from "react";
import Link from "next/link";
import type { ProductClaims } from "@/lib/manager/product-claims";
import {
  ORDER_STATUS_META,
  type OrderStatus,
} from "@/lib/manager/order-status";

/**
 * UI-панель «Активних замовлень» на товар (← Етап 1 блоку Замовлень).
 *
 * Показує сумарну кількість мішків / кг, кількість замовлень і менеджерів.
 * Розгортається у список замовлень з посиланнями. «Моє» позначається бейджем.
 *
 * Узгоджено з user: аналог 1С-мобільного — кількість замовлених лотів на товар.
 */
export function ProductClaimsPanel({ claims }: { claims: ProductClaims }) {
  const [expanded, setExpanded] = useState(false);

  if (claims.totalQuantity === 0) {
    return (
      <div className="rounded-md border border-dashed border-gray-200 bg-gray-50/50 px-3 py-2 text-xs text-gray-500">
        📋 На цей товар поки нема активних замовлень
      </div>
    );
  }

  const summary = `${claims.totalQuantity} ${pluralBag(claims.totalQuantity)} / ${claims.totalWeight} кг`;
  const ordersLabel = `${claims.ordersCount} ${pluralOrder(claims.ordersCount)}`;
  const managersLabel =
    claims.managersCount > 0
      ? `${claims.managersCount} ${pluralManager(claims.managersCount)}`
      : "без призначеного агента";

  return (
    <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between gap-2 text-left text-sm font-medium text-amber-900 hover:text-amber-700"
      >
        <span className="flex items-center gap-1.5">
          <span aria-hidden>📋</span>
          <span>Замовлено: {summary}</span>
          <span className="text-xs font-normal text-amber-700">
            ({ordersLabel}, {managersLabel})
          </span>
        </span>
        <span aria-hidden className="text-xs text-amber-700">
          {expanded ? "▲" : "▼"}
        </span>
      </button>
      {expanded ? (
        <ul className="mt-2 divide-y divide-amber-200 border-t border-amber-200">
          {claims.orders.map((o) => {
            const statusKey = o.status as OrderStatus;
            const statusLabel = ORDER_STATUS_META[statusKey]?.label ?? o.status;
            return (
              <li
                key={o.id}
                className="flex items-center justify-between gap-2 py-1.5 text-xs"
              >
                <div className="flex min-w-0 flex-1 flex-col">
                  <div className="flex items-center gap-1.5">
                    <Link
                      href={`/manager/orders/${o.id}`}
                      className="truncate font-medium text-amber-900 hover:underline"
                    >
                      {o.customerName}
                    </Link>
                    {o.isMine ? (
                      <span className="rounded-sm bg-amber-200 px-1 py-px text-[10px] font-semibold uppercase text-amber-900">
                        моє
                      </span>
                    ) : null}
                  </div>
                  <div className="truncate text-amber-700">
                    {o.agentName ?? "— без агента"} · {statusLabel} ·{" "}
                    {formatDate(o.createdAt)}
                  </div>
                </div>
                <div className="shrink-0 text-right font-medium text-amber-900">
                  {o.quantity} шт
                  <span className="ml-1 text-amber-700">/ {o.weight} кг</span>
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

/**
 * Облегшений бейдж «X шт замовлено» для рядка списку Прайсу.
 * Без розкривного списку, тільки сумарна цифра — компактно.
 */
export function ProductClaimsBadge({
  totalQuantity,
  totalWeight,
  ordersCount,
}: {
  totalQuantity: number;
  totalWeight: number;
  ordersCount: number;
}) {
  if (totalQuantity === 0) return null;
  return (
    <span
      title={`Активних замовлень: ${ordersCount}; сумарно ${totalWeight} кг`}
      className="inline-flex items-center gap-1 rounded-sm bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-900"
    >
      <span aria-hidden>📋</span>
      {totalQuantity} {pluralBag(totalQuantity)}
    </span>
  );
}

function pluralBag(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "мішок";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "мішки";
  return "мішків";
}

function pluralOrder(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "замовлення";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14))
    return "замовлення";
  return "замовлень";
}

function pluralManager(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "менеджер";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14))
    return "менеджери";
  return "менеджерів";
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = String(d.getFullYear()).slice(-2);
  return `${dd}.${mm}.${yy}`;
}
