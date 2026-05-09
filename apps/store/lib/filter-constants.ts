/**
 * Shared default range bounds for catalog/lots filter forms.
 *
 * unitsPerKg / unitWeight bounds are static — the catalog spans the full
 * 1..1000 range and the previous /api/catalog/numeric-ranges endpoint
 * returned identical hardcoded constants. Inlined to skip the network
 * round-trip on every catalog visit.
 *
 * priceEur bounds are static fallback only — the catalog form fetches the
 * real min/max from /api/catalog/price-range on mount.
 */

export const DEFAULT_UNITS_RANGE: [number, number] = [1, 1000];
export const DEFAULT_WEIGHT_RANGE: [number, number] = [1, 1000];
export const DEFAULT_PRICE_RANGE: [number, number] = [0, 100];
