"use client";

import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Лінк, який усередині shell-вкладки (iframe) відкриває ціль у НОВІЙ вкладці
 * менеджерки (postMessage до top-вікна, слухач у TabsProvider), а поза shell
 * (відкріплене вікно / прямий візит) — звичайна навігація (7.3).
 *
 * Використовується для «блочних» переходів (плитки дашборда тощо), де перехід
 * у поточній вкладці затирав би Робочий стіл.
 */
export function OpenTabLink({
  href,
  label,
  className,
  children,
}: {
  href: string;
  /** Початкова назва нової вкладки (уточниться з <title> сторінки). */
  label?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className={className}
      onClick={(e) => {
        if (typeof window === "undefined") return;
        if (window.self === window.top) return; // не в iframe — звичайний перехід
        e.preventDefault();
        window.parent.postMessage(
          { type: "ltex:open-tab", url: href, label },
          window.location.origin,
        );
      }}
    >
      {children}
    </Link>
  );
}
