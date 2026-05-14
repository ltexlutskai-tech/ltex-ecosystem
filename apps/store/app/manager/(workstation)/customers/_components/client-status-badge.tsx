export interface ClientStatus {
  code: string;
  label: string;
  colorHex: string;
}

export function ClientStatusBadge({
  status,
  fallback = "—",
}: {
  status: ClientStatus | null;
  fallback?: string;
}) {
  if (!status) {
    return <span className="text-xs text-gray-400">{fallback}</span>;
  }
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
      style={{
        backgroundColor: hexToBgRgba(status.colorHex, 0.12),
        color: status.colorHex,
      }}
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: status.colorHex }}
        aria-hidden
      />
      {status.label}
    </span>
  );
}

function hexToBgRgba(hex: string, alpha: number): string {
  const sanitized = hex.replace("#", "");
  if (sanitized.length !== 6) return hex;
  const r = parseInt(sanitized.slice(0, 2), 16);
  const g = parseInt(sanitized.slice(2, 4), 16);
  const b = parseInt(sanitized.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
