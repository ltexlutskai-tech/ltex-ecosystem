import { MapPin } from "lucide-react";

interface AddressProps {
  region: string | null;
  city: string | null;
  street: string | null;
  house: string | null;
}

function joinAddress({ region, city, street, house }: AddressProps): string {
  const parts: string[] = [];
  if (region) parts.push(region);
  if (city) parts.push(city);
  const streetPart = [street, house].filter(Boolean).join(", ");
  if (streetPart) parts.push(streetPart);
  return parts.join(", ");
}

/**
 * Адреса → Google Maps deeplink.
 */
export function ClientAddressLink(props: AddressProps) {
  const full = joinAddress(props);
  if (!full) return <span className="text-gray-400">—</span>;
  const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(full)}`;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener"
      className="inline-flex items-center gap-1 text-gray-800 hover:text-blue-700"
    >
      <MapPin className="h-3.5 w-3.5" />
      <span>{full}</span>
    </a>
  );
}

/**
 * Відділення НП → Google Maps deeplink "Нова Пошта №N City".
 */
export function NovaPoshtaBranchLink({
  branch,
  city,
}: {
  branch: string | null;
  city: string | null;
}) {
  if (!branch) return <span className="text-gray-400">—</span>;
  const query = ["Нова Пошта", `№${branch}`, city].filter(Boolean).join(" ");
  const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener"
      className="inline-flex items-center gap-1 text-gray-800 hover:text-blue-700"
    >
      <MapPin className="h-3.5 w-3.5" />
      <span>№{branch}</span>
    </a>
  );
}

/**
 * Геолокація `"lat,lng"` → Maps з pin.
 */
export function GeolocationLink({ geo }: { geo: string | null }) {
  if (!geo) return <span className="text-gray-400">—</span>;
  const trimmed = geo.trim();
  const match = trimmed.match(/^(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)$/);
  if (!match) return <span className="text-gray-700">{trimmed}</span>;
  const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${match[1]},${match[2]}`)}`;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener"
      className="inline-flex items-center gap-1 text-gray-800 hover:text-blue-700"
    >
      <MapPin className="h-3.5 w-3.5" />
      <span>
        {match[1]}, {match[2]}
      </span>
    </a>
  );
}

/**
 * Сайт клієнта → відкрити в новій вкладці.
 */
export function ClientWebsiteLink({ url }: { url: string | null }) {
  if (!url) return <span className="text-gray-400">—</span>;
  const href =
    url.startsWith("http://") || url.startsWith("https://")
      ? url
      : `https://${url}`;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener"
      className="text-blue-700 hover:underline"
    >
      🔗 {url}
    </a>
  );
}
