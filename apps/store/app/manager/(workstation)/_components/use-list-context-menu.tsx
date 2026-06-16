"use client";

import type { JSX } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ListContextMenu, type ContextMenuItem } from "./list-context-menu";

/** Контекст клітинки, на якій відкрите меню. */
export interface MenuContext {
  /** `data-col` клітинки (ключ колонки) або null (клітинка без колонки). */
  col: string | null;
  /** `data-value` клітинки (рядкове значення) або null. */
  value: string | null;
  /** Посилання на картку документа цього рядка. */
  href: string;
}

/** Обробники, які спредяться на `<tr>` рядка списку. */
export interface RowHandlers {
  onContextMenu: (e: React.MouseEvent) => void;
  onTouchStart: (e: React.TouchEvent) => void;
  onTouchEnd: () => void;
  onTouchMove: () => void;
}

interface MenuState {
  x: number;
  y: number;
  col: string | null;
  value: string | null;
  href: string;
}

const LONG_PRESS_MS = 500;

/**
 * Хук контекстного меню для рядків менеджерських списків.
 *
 * Десктоп — права кнопка миші (`onContextMenu`). Мобільний — довге натискання
 * (~500мс) на рядку; рух пальцем скасовує. `buildItems` отримує контекст
 * клітинки (колонка/значення/href) і будує список пунктів — архітектура
 * розширювана через цей колбек.
 */
export function useListContextMenu(
  buildItems: (ctx: MenuContext, close: () => void) => ContextMenuItem[],
): { rowHandlers: (href: string) => RowHandlers; menu: JSX.Element | null } {
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
    (href: string): RowHandlers => ({
      onContextMenu: (e: React.MouseEvent) => {
        e.preventDefault();
        const td = (e.target as HTMLElement).closest("td");
        setState({
          x: e.clientX,
          y: e.clientY,
          col: td?.dataset.col ?? null,
          value: td?.dataset.value ?? null,
          href,
        });
      },
      onTouchStart: (e: React.TouchEvent) => {
        const touch = e.touches[0];
        if (!touch) return;
        const { clientX, clientY } = touch;
        clearTimer();
        longPressTimer.current = setTimeout(() => {
          const el = document.elementFromPoint(clientX, clientY);
          const td = el?.closest("td") ?? null;
          setState({
            x: clientX,
            y: clientY,
            col: td?.dataset.col ?? null,
            value: td?.dataset.value ?? null,
            href,
          });
        }, LONG_PRESS_MS);
      },
      onTouchEnd: clearTimer,
      onTouchMove: clearTimer,
    }),
    [clearTimer],
  );

  const menu =
    state !== null ? (
      <ListContextMenu
        open
        x={state.x}
        y={state.y}
        items={buildItems(
          { col: state.col, value: state.value, href: state.href },
          close,
        )}
        onClose={close}
      />
    ) : null;

  return { rowHandlers, menu };
}
