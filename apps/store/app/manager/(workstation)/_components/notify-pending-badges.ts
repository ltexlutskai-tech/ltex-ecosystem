/**
 * Просити сайдбар-бейджі «Очікує підтвердження» перечитати лічильники —
 * викликати після проведення/видалення замовлення чи реалізації. Бейджі живуть
 * у top-вікні shell, а документи — в iframe-вкладках, тому шлемо postMessage до
 * батьківського вікна (яке == self, коли сторінка відкрита напряму).
 */
export function notifyPendingBadges(): void {
  if (typeof window === "undefined") return;
  try {
    window.parent.postMessage(
      { type: "ltex:refresh-pending" },
      window.location.origin,
    );
  } catch {
    // ignore
  }
}
