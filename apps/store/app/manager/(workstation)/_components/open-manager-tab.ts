/**
 * Відкрити внутрішній маршрут менеджерки в НОВІЙ вкладці програми (7.3).
 *
 * Усередині shell сторінки живуть в iframe-ах; щоб перехід в інший блок не
 * затирав поточний документ (і «Назад до списку» не втрачав контекст), крос-
 * блокові переходи шлемо як postMessage до top-вікна — слухач у `TabsProvider`
 * відкриває нову вкладку. Поза shell (відкріплене вікно / прямий візит) —
 * звичайна навігація.
 */
export function openManagerTab(url: string, label?: string): void {
  if (typeof window === "undefined") return;
  if (window.self === window.top) {
    window.location.href = url;
    return;
  }
  window.parent.postMessage(
    { type: "ltex:open-tab", url, label },
    window.location.origin,
  );
}
