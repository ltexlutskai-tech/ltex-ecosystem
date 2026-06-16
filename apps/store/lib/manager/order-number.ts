/**
 * Відображуваний номер замовлення.
 *
 * Перевага — людському номеру з 1С (`number1C`, напр. "L0000002477"). Якщо
 * його немає (легасі / ще не реімпортовано), fallback на `code1C` (hex):
 * довгий hex скорочується до `…XXXXXX`, щоб не ламати верстку. `code1C`
 * лишається унікальним ключем — це лише форматер для UI.
 */
export function formatOrderNumber(o: {
  number1C?: string | null;
  code1C?: string | null;
}): string {
  if (o.number1C && o.number1C.trim()) return o.number1C.trim();
  if (o.code1C)
    return o.code1C.length > 12 ? `…${o.code1C.slice(-6)}` : o.code1C;
  return "—";
}

/**
 * Відображуваний номер документа для Реалізації / Касового ордера /
 * Маршрутного листа. На відміну від `Order`, ці документи мають локальний
 * autoincrement `docNumber`. Перевага — людському номеру з 1С (`number1C`),
 * далі локальний `№<docNumber>`, далі скорочений hex `code1C`, інакше "—".
 * `code1C` лишається унікальним ключем — це лише форматер для UI.
 */
export function formatDocNumber(o: {
  number1C?: string | null;
  code1C?: string | null;
  docNumber?: number | null;
}): string {
  if (o.number1C && o.number1C.trim()) return o.number1C.trim();
  if (o.docNumber != null) return `№${o.docNumber}`;
  if (o.code1C)
    return o.code1C.length > 12 ? `…${o.code1C.slice(-6)}` : o.code1C;
  return "—";
}
