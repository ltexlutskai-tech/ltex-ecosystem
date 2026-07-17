"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { OrderVideoButton } from "./order-video-button";

/** Дані лоту, потрібні контекстному меню рядка лоту. */
export interface LotRowMenuTarget {
  lotId: string;
  barcode: string;
  productId: string;
  productName: string;
  articleCode: string | null;
}

interface Props {
  target: LotRowMenuTarget | null;
  position: { x: number; y: number } | null;
  onClose: () => void;
  /** Відкрити картку лоту (модалку) — там усі дії (бронь/збереження/поділитися). */
  onOpenCard: (lotId: string) => void;
  /** ПІБ поточного менеджера (продавець у «Замовити відео»). */
  sellerName: string;
}

/**
 * Контекстне меню рядка лоту (ПКМ / довге натискання) — дзеркалить
 * `ProductRowMenu`. Дає швидкі дії лоту без відкриття картки: відкрити картку
 * (де решта дій), скопіювати штрихкод, замовити відео. Рендериться у портал,
 * закривається кліком-поза/Escape/скролом.
 */
export function LotRowMenu({
  target,
  position,
  onClose,
  onOpenCard,
  sellerName,
}: Props) {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [mounted, setMounted] = useState(false);
  const [videoOpen, setVideoOpen] = useState(false);
  const [coords, setCoords] = useState<{ left: number; top: number } | null>(
    null,
  );
  const [activeTarget, setActiveTarget] = useState<LotRowMenuTarget | null>(
    null,
  );

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (target) setActiveTarget(target);
  }, [target]);

  useEffect(() => {
    if (!position) {
      setCoords(null);
      return;
    }
    const el = menuRef.current;
    const width = el?.offsetWidth ?? 220;
    const height = el?.offsetHeight ?? 180;
    const pad = 8;
    const left = Math.min(position.x, window.innerWidth - width - pad);
    const top = Math.min(position.y, window.innerHeight - height - pad);
    setCoords({ left: Math.max(pad, left), top: Math.max(pad, top) });
  }, [position, target]);

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

  async function copyBarcode(code: string) {
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      // clipboard недоступний — тихо ігноруємо (нема на що впасти).
    }
  }

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
            className={`z-50 min-w-[200px] overflow-hidden rounded-md border bg-white py-1 text-sm shadow-lg ${
              coords ? "" : "invisible"
            }`}
            onContextMenu={(e) => e.preventDefault()}
          >
            <MenuItem
              onClick={() => {
                onOpenCard(target.lotId);
                onClose();
              }}
            >
              Відкрити картку лоту
            </MenuItem>
            <MenuItem
              onClick={() => {
                void copyBarcode(target.barcode);
                onClose();
              }}
            >
              Скопіювати штрихкод
            </MenuItem>
            <div className="my-1 border-t" />
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

      {activeTarget && (
        <OrderVideoButton
          hideTrigger
          open={videoOpen}
          onOpenChange={setVideoOpen}
          productName={activeTarget.productName}
          articleCode={activeTarget.articleCode}
          productId={activeTarget.productId}
          sellerName={sellerName}
        />
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
