const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

export function formatRelativeShort(date: Date | string | number): string {
  const value =
    date instanceof Date ? date.getTime() : new Date(date).getTime();
  if (Number.isNaN(value)) return "—";
  const diff = Math.max(0, Date.now() - value);
  if (diff < MIN) {
    const s = Math.max(1, Math.floor(diff / 1000));
    return `${s} с тому`;
  }
  if (diff < HOUR) {
    const m = Math.floor(diff / MIN);
    return `${m} хв тому`;
  }
  if (diff < DAY) {
    const h = Math.floor(diff / HOUR);
    return `${h} год тому`;
  }
  const d = Math.floor(diff / DAY);
  return `${d} дн тому`;
}
