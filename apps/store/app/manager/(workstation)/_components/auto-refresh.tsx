"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Автооновлення даних серверного компонента без перезавантаження сторінки.
 *
 * Викликає `router.refresh()` (перезапитує серверні дані, зберігаючи стан
 * клієнтських компонентів і форм — useState не скидається) на інтервалі та при
 * поверненні на вкладку (focus / visibilitychange). Рендерить null.
 *
 * Ставиться у списки/картки, щоб інформація оновлювалась «наживо» — без ручного
 * F5. Пауза, коли вкладка прихована (не смикаємо сервер даремно).
 */
export function AutoRefresh({
  intervalMs = 20_000,
}: {
  /** Період автооновлення, мс (за замовч. 20 с). */
  intervalMs?: number;
}) {
  const router = useRouter();

  useEffect(() => {
    function refreshIfVisible() {
      if (document.visibilityState === "visible") router.refresh();
    }
    const id = window.setInterval(refreshIfVisible, intervalMs);
    function onVis() {
      if (document.visibilityState === "visible") router.refresh();
    }
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", onVis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", onVis);
    };
  }, [router, intervalMs]);

  return null;
}
