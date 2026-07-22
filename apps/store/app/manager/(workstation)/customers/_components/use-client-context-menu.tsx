"use client";

import type { JSX } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  phoneToTelUrl,
  phoneToViberUrl,
  phoneToWhatsAppUrl,
} from "@ltex/shared";
import {
  ListContextMenu,
  type ContextMenuItem,
} from "../../_components/list-context-menu";
import type { ClientListItem } from "./types";

const LONG_PRESS_MS = 500;

/** Обробники, які спредяться на `<tr>` рядка списку клієнтів. */
export interface ClientRowHandlers {
  onContextMenu: (e: React.MouseEvent) => void;
  onTouchStart: (e: React.TouchEvent) => void;
  onTouchEnd: () => void;
  onTouchMove: () => void;
}

interface MenuState {
  x: number;
  y: number;
  client: ClientListItem;
}

/** Відкрити зовнішнє посилання (месенджер/дзвінок) з контекстного меню. */
function openContact(url: string) {
  if (url.startsWith("http")) {
    window.open(url, "_blank", "noopener");
  } else {
    // tel:/viber:// — браузер перехоплює, iframe нікуди не «їде».
    window.location.href = url;
  }
}

/**
 * Будує пункти контекстного меню для рядка клієнта: швидкі документи
 * (Замовлення / Реалізація / Закриття / Нагадування) + кнопки месенджерів
 * з основного номера. Навігація — у поточну вкладку менеджерки (`router.push`),
 * як звичайне відкриття картки.
 */
function buildClientMenuItems(
  client: ClientListItem,
  go: (href: string) => void,
): ContextMenuItem[] {
  const items: ContextMenuItem[] = [];

  items.push({
    type: "action",
    label: "Відкрити картку",
    onSelect: () => go(`/manager/customers/${client.id}`),
  });
  items.push({ type: "separator" });
  items.push({
    type: "action",
    label: "Створити замовлення",
    onSelect: () =>
      go(
        client.customerId
          ? `/manager/orders/new?clientId=${client.customerId}`
          : "/manager/orders/new",
      ),
  });
  items.push({
    type: "action",
    label: "Створити реалізацію",
    onSelect: () =>
      go(
        client.customerId
          ? `/manager/sales/new?clientId=${client.customerId}`
          : "/manager/sales/new",
      ),
  });
  items.push({
    type: "action",
    label: "Закрити замовлення",
    onSelect: () => go(`/manager/closures?clientId=${client.id}`),
  });
  items.push({
    type: "action",
    label: "Додати нагадування",
    onSelect: () => go(`/manager/customers/${client.id}#reminders`),
  });

  // ── Кнопки месенджерів із основного номера ──
  const phone = client.phonePrimary;
  const tel = phone ? phoneToTelUrl(phone) : null;
  const viber = phone ? phoneToViberUrl(phone) : null;
  const whatsapp = phone ? phoneToWhatsAppUrl(phone) : null;
  if (tel || viber || whatsapp) {
    items.push({ type: "separator" });
    if (tel)
      items.push({
        type: "action",
        label: "Подзвонити",
        onSelect: () => openContact(tel),
      });
    if (viber)
      items.push({
        type: "action",
        label: "Написати у Viber",
        onSelect: () => openContact(viber),
      });
    if (whatsapp)
      items.push({
        type: "action",
        label: "Написати у WhatsApp",
        onSelect: () => openContact(whatsapp),
      });
  }

  return items;
}

/**
 * Контекстне меню рядка клієнта (ПКМ на десктопі / довге натискання на моб.).
 * На відміну від спільного `useListContextMenu` (яке працює з клітинками
 * документів), тут захоплюється увесь обʼєкт клієнта, щоб дати доступ до його
 * телефона й Customer-дзеркала для швидких дій.
 */
export function useClientContextMenu(): {
  rowHandlers: (client: ClientListItem) => ClientRowHandlers;
  menu: JSX.Element | null;
} {
  const router = useRouter();
  const [state, setState] = useState<MenuState | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const close = useCallback(() => setState(null), []);

  const clearTimer = useCallback(() => {
    if (longPressTimer.current !== null) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  useEffect(() => clearTimer, [clearTimer]);

  const rowHandlers = useCallback(
    (client: ClientListItem): ClientRowHandlers => ({
      onContextMenu: (e: React.MouseEvent) => {
        e.preventDefault();
        setState({ x: e.clientX, y: e.clientY, client });
      },
      onTouchStart: (e: React.TouchEvent) => {
        const touch = e.touches[0];
        if (!touch) return;
        const { clientX, clientY } = touch;
        clearTimer();
        longPressTimer.current = setTimeout(() => {
          setState({ x: clientX, y: clientY, client });
        }, LONG_PRESS_MS);
      },
      onTouchEnd: clearTimer,
      onTouchMove: clearTimer,
    }),
    [clearTimer],
  );

  const go = useCallback(
    (href: string) => {
      close();
      router.push(href);
    },
    [close, router],
  );

  const menu =
    state !== null ? (
      <ListContextMenu
        open
        x={state.x}
        y={state.y}
        items={buildClientMenuItems(state.client, go)}
        onClose={close}
      />
    ) : null;

  return { rowHandlers, menu };
}
