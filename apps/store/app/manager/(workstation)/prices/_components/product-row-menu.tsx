"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ShareSheet } from "./share-sheet";
import { OrderVideoButton } from "./order-video-button";

const SITE_BASE = "https://new.ltex.com.ua";

/** Дані товара, потрібні контекстному меню рядка прайсу. */
export interface ProductRowMenuTarget {
  id: string;
  name: string;
  slug: string;
  articleCode: string | null;
  videoUrl: string | null;
  /** Готовий рекламний текст товара (зібраний на сервері з курсом EUR). */
  shareText: string;
}

interface Props {
  /** Товар, для якого відкрите меню; null коли меню сховане. */
  target: ProductRowMenuTarget | null;
  /** Позиція курсора/довгого натискання (viewport-координати). */
  position: { x: number; y: number } | null;
  /** Закрити меню (без виконання дії). */
  onClose: () => void;
  /** ПІБ поточного менеджера (продавець у запиті «Замовити відео»). */
  sellerName: string;
}

/**
 * Manager «Прайс» — перевикористовуване контекстне меню рядка товара.
 *
 * Відкривається правою кнопкою (desktop, `onContextMenu`) або довгим натисканням
 * (mobile, ~500мс) — це обробляє батьківський компонент, який передає `target` +
 * `position`. `@ltex/ui` не має Radix DropdownMenu/ContextMenu, тому це власний
 * позиціонований popup: рендериться у портал, закривається кліком-поза-меню та
 * Escape, утримується в межах viewport.
 *
 * Дії: YouTube · Сайт · Наявні лоти · Поділитися (`ShareSheet`) · Замовити відео
 * (перевикористаний flow `OrderVideoButton` у «безголовому» режимі). Це БАЗА —
 * надалі сюди виноситимемо решту дій рядка.
 */
export function ProductRowMenu({
  target,
  position,
  onClose,
  sellerName,
}: Props) {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [videoOpen, setVideoOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [coords, setCoords] = useState<{ left: number; top: number } | null>(
    null,
  );
  // Знімок товара для ShareSheet / OrderVideo — лишається після закриття меню
  // (parent обнуляє `target` на onClose, а діалоги мають жити далі).
  const [activeTarget, setActiveTarget] = useState<ProductRowMenuTarget | null>(
    null,
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  // Запам'ятовуємо останній відкритий товар (для діалогів після закриття меню).
  useEffect(() => {
    if (target) setActiveTarget(target);
  }, [target]);

  // Утримуємо popup у межах viewport (зсуваємо вліво/вгору якщо вилазить).
  useEffect(() => {
    if (!position) {
      setCoords(null);
      return;
    }
    const el = menuRef.current;
    const width = el?.offsetWidth ?? 220;
    const height = el?.offsetHeight ?? 240;
    const pad = 8;
    const left = Math.min(position.x, window.innerWidth - width - pad);
    const top = Math.min(position.y, window.innerHeight - height - pad);
    setCoords({ left: Math.max(pad, left), top: Math.max(pad, top) });
  }, [position, target]);

  // Закриття: клік-поза-меню, Escape, скрол/resize.
  useEffect(() => {
    if (!position) return;
    function onPointerDown(e: MouseEvent | TouchEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onClose);
    window.addEventListener("scroll", onClose, true);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onClose);
      window.removeEventListener("scroll", onClose, true);
    };
  }, [position, onClose]);

  if (!mounted) return null;

  const open = target !== null && position !== null;

  return (
    <>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            style={{
              position: "fixed",
              left: coords?.left ?? position.x,
              top: coords?.top ?? position.y,
            }}
            // visibility:hidden до першого виміру щоб не блимало у (0,0).
            className={`z-50 min-w-[200px] overflow-hidden rounded-md border bg-white py-1 text-sm shadow-lg ${
              coords ? "" : "invisible"
            }`}
            onContextMenu={(e) => e.preventDefault()}
          >
            {target.videoUrl && (
              <MenuItem
                onClick={() => {
                  window.open(
                    target.videoUrl as string,
                    "_blank",
                    "noopener,noreferrer",
                  );
                  onClose();
                }}
              >
                ▶ YouTube
              </MenuItem>
            )}
            <MenuItem
              onClick={() => {
                window.open(
                  `${SITE_BASE}/product/${target.slug}`,
                  "_blank",
                  "noopener,noreferrer",
                );
                onClose();
              }}
            >
              Сайт ↗
            </MenuItem>
            <MenuItem
              onClick={() => {
                window.open(
                  `/manager/prices/lots?productId=${target.id}`,
                  "_blank",
                  "noopener,noreferrer",
                );
                onClose();
              }}
            >
              Наявні лоти
            </MenuItem>
            <div className="my-1 border-t" />
            <MenuItem
              onClick={() => {
                setShareOpen(true);
                onClose();
              }}
            >
              Поділитися
            </MenuItem>
            <MenuItem
              onClick={() => {
                setVideoOpen(true);
                onClose();
              }}
            >
              Замовити відео
            </MenuItem>
          </div>,
          document.body,
        )}

      {/* ShareSheet / OrderVideo flow живуть поза popup-ом — лишаються відкритими
          після закриття меню. Текст береться зі знімка останнього target-у. */}
      {activeTarget && (
        <>
          <ShareSheet
            open={shareOpen}
            onOpenChange={setShareOpen}
            title="Поділитися товаром"
            text={activeTarget.shareText}
          />
          <OrderVideoButton
            hideTrigger
            open={videoOpen}
            onOpenChange={setVideoOpen}
            productName={activeTarget.name}
            articleCode={activeTarget.articleCode}
            sellerName={sellerName}
          />
        </>
      )}
    </>
  );
}

function MenuItem({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="block w-full px-3 py-2 text-left text-gray-700 hover:bg-gray-100"
    >
      {children}
    </button>
  );
}
