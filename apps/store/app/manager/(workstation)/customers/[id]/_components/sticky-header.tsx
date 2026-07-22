"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * Закріплена шапка картки клієнта — завжди видно, з ким працюємо, навіть коли
 * прокручуємо історію/вкладки. Додатково вимірює свою висоту й пише її у CSS-
 * змінну `--ccard-header-h`, щоб бічне меню вкладок (теж sticky) закріплювалось
 * саме ПІД шапкою, а не за нею (висота шапки змінна — залежить від к-сті
 * телефонів).
 */
export function StickyHeader({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      document.documentElement.style.setProperty(
        "--ccard-header-h",
        `${el.offsetHeight}px`,
      );
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      ro.disconnect();
      document.documentElement.style.removeProperty("--ccard-header-h");
    };
  }, []);

  return (
    <div
      ref={ref}
      className="sticky top-0 z-20 -mx-1 bg-gray-50 px-1 pt-1 pb-2"
    >
      {children}
    </div>
  );
}
