const COLORS = [
  "bg-green-600",
  "bg-blue-600",
  "bg-purple-600",
  "bg-pink-600",
  "bg-amber-600",
  "bg-teal-600",
  "bg-indigo-600",
  "bg-rose-600",
];

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0];
  if (!first) return "?";
  const second = parts[1];
  if (!second) return first.slice(0, 2).toUpperCase();
  return (first.charAt(0) + second.charAt(0)).toUpperCase();
}

function colorFor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0;
  }
  return COLORS[Math.abs(hash) % COLORS.length] ?? "bg-green-600";
}

/** Кругла аватарка з ініціалами й детермінованим кольором за іменем. */
export function Avatar({
  name,
  size = "md",
}: {
  name: string;
  size?: "sm" | "md" | "lg";
}) {
  const sizeCls =
    size === "lg"
      ? "h-10 w-10 text-sm"
      : size === "sm"
        ? "h-7 w-7 text-[10px]"
        : "h-9 w-9 text-xs";
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white ${colorFor(name)} ${sizeCls}`}
      aria-hidden="true"
    >
      {initials(name)}
    </span>
  );
}
