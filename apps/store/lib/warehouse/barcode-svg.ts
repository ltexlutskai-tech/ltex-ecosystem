/**
 * Простий рендеринг штрихкоду у вигляді SVG (← правки 2026-06-04).
 *
 * Використовуємо **Code 39** — найпростіший лінійний штрихкод, який
 * розпізнають усі сканери і не потребує спеціальних кодувань (на відміну
 * від Code 128, де треба обчислювати control-character). Code 39 кодує
 * 0-9, A-Z і деякі службові символи. Цього достатньо для нашого паттерну
 * `L-{articleCode}-{seq:05}`.
 *
 * Кожен символ — 9 елементів (5 чорних + 4 пробіли), із них 3 широкі.
 * Старт/стоп = `*`.
 *
 * Без npm-залежностей. Експортуємо SVG-рядок.
 */

const CODE39: Record<string, string> = {
  // Кожен символ — 9-bit pattern: 1=narrow, 2=wide (для 5 bars + 4 spaces)
  // Перші 5 цифр - bars, останні 4 - spaces
  "0": "111221211",
  "1": "211211112",
  "2": "112211112",
  "3": "212211111",
  "4": "111221112",
  "5": "211221111",
  "6": "112221111",
  "7": "111211212",
  "8": "211211211",
  "9": "112211211",
  A: "211112112",
  B: "112112112",
  C: "212112111",
  D: "111122112",
  E: "211122111",
  F: "112122111",
  G: "111112212",
  H: "211112211",
  I: "112112211",
  J: "111122211",
  K: "211111122",
  L: "112111122",
  M: "212111121",
  N: "111121122",
  O: "211121121",
  P: "112121121",
  Q: "111111222",
  R: "211111221",
  S: "112111221",
  T: "111121221",
  U: "221111112",
  V: "122111112",
  W: "222111111",
  X: "121121112",
  Y: "221121111",
  Z: "122121111",
  "-": "121111212",
  ".": "221111211",
  " ": "122111211",
  $: "121212111",
  "/": "121211121",
  "+": "121112121",
  "%": "111212121",
  "*": "121121211", // start/stop
};

export interface BarcodeSvgOptions {
  /** Висота штрихкоду у пікселях. Default = 60. */
  height?: number;
  /** Ширина вузької лінії. Default = 2. */
  narrowWidth?: number;
  /** Множник для широкої лінії. Default = 3. */
  wideRatio?: number;
  /** Показувати текст під штрихкодом. Default = true. */
  showText?: boolean;
}

/**
 * Згенерувати SVG-штрихкод для заданого коду.
 * Повертає рядок SVG, готовий для вставки у HTML / використання у print.
 */
export function generateBarcodeSvg(
  code: string,
  options: BarcodeSvgOptions = {},
): string {
  const height = options.height ?? 60;
  const narrow = options.narrowWidth ?? 2;
  const wide = narrow * (options.wideRatio ?? 3);
  const showText = options.showText ?? true;
  const textHeight = showText ? 16 : 0;

  const normalized = code.toUpperCase();
  const sequence = `*${normalized}*`;

  // Обчислюємо повну ширину
  let totalWidth = 0;
  const elements: { width: number; isBar: boolean }[] = [];
  for (let ci = 0; ci < sequence.length; ci++) {
    const ch = sequence[ci];
    if (!ch) continue;
    const pattern = CODE39[ch];
    if (!pattern) continue; // Невідомий символ — скіп
    for (let i = 0; i < pattern.length; i++) {
      const w = pattern[i] === "2" ? wide : narrow;
      elements.push({ width: w, isBar: i % 2 === 0 });
      totalWidth += w;
    }
    // Inter-character gap (narrow)
    if (ci < sequence.length - 1) {
      elements.push({ width: narrow, isBar: false });
      totalWidth += narrow;
    }
  }

  const svgWidth = totalWidth;
  const svgHeight = height + textHeight;

  let x = 0;
  const bars: string[] = [];
  for (const el of elements) {
    if (el.isBar) {
      bars.push(
        `<rect x="${x}" y="0" width="${el.width}" height="${height}" fill="#000"/>`,
      );
    }
    x += el.width;
  }

  const textSvg = showText
    ? `<text x="${svgWidth / 2}" y="${height + 14}" font-family="monospace" font-size="14" text-anchor="middle" fill="#000">${escapeXml(normalized)}</text>`
    : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgWidth} ${svgHeight}" width="${svgWidth}" height="${svgHeight}">${bars.join("")}${textSvg}</svg>`;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
