"use client";

import {
  ClipboardList,
  FileText,
  Map,
  Package,
  Printer,
  Tag,
  Truck,
  User,
  Wallet,
} from "lucide-react";
import type { MessengerDocRef, MessengerDocRefType } from "./types";
import { openManagerTab } from "../../_components/open-manager-tab";

const ICONS: Record<
  MessengerDocRefType,
  React.ComponentType<{ className?: string }>
> = {
  order: ClipboardList,
  sale: Truck,
  route: Map,
  client: User,
  product: Package,
  lot: Tag,
  payment: Wallet,
  print: Printer,
};

const TYPE_LABELS: Record<MessengerDocRefType, string> = {
  order: "Замовлення",
  sale: "Реалізація",
  route: "Маршрутний лист",
  client: "Клієнт",
  product: "Товар",
  lot: "Лот",
  payment: "Оплата",
  print: "Друкована форма",
};

/** Клікабельна картка внутрішнього документа всередині повідомлення. */
export function DocRefCard({
  docRef,
  isMine,
}: {
  docRef: MessengerDocRef;
  isMine: boolean;
}) {
  const Icon = ICONS[docRef.type] ?? FileText;
  return (
    <a
      href={docRef.url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => {
        // Усередині shell (месенджер в iframe) відкриваємо документ окремою
        // вкладкою менеджерки; поза shell — звичайне відкриття у новій вкладці.
        if (typeof window === "undefined") return;
        if (window.self === window.top) return;
        e.preventDefault();
        openManagerTab(docRef.url, TYPE_LABELS[docRef.type] ?? "Документ");
      }}
      className={
        isMine
          ? "mb-1 flex items-center gap-2 rounded-md bg-white/15 px-2 py-1.5 hover:bg-white/25"
          : "mb-1 flex items-center gap-2 rounded-md border border-gray-200 bg-gray-50 px-2 py-1.5 hover:bg-gray-100"
      }
    >
      <span
        className={
          isMine
            ? "flex h-8 w-8 shrink-0 items-center justify-center rounded bg-white/20"
            : "flex h-8 w-8 shrink-0 items-center justify-center rounded bg-green-100 text-green-700"
        }
      >
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={
            isMine
              ? "block text-[10px] uppercase text-green-100"
              : "block text-[10px] uppercase text-gray-400"
          }
        >
          {TYPE_LABELS[docRef.type] ?? "Документ"}
        </span>
        <span className="block truncate text-sm font-medium">
          {docRef.label}
        </span>
        {docRef.subtitle && (
          <span
            className={
              isMine
                ? "block truncate text-xs text-green-100"
                : "block truncate text-xs text-gray-500"
            }
          >
            {docRef.subtitle}
          </span>
        )}
      </span>
    </a>
  );
}
