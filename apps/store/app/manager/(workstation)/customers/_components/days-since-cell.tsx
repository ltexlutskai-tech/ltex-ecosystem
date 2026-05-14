export function DaysSinceCell({ days }: { days: number | null }) {
  if (days == null) {
    return <span className="text-xs text-gray-400">—</span>;
  }
  let cls = "text-gray-700";
  if (days > 90) cls = "font-medium text-red-700";
  else if (days > 30) cls = "font-medium text-amber-700";
  return <span className={cls}>{days}</span>;
}
