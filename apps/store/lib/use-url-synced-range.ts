"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export interface UrlSyncedRangeOptions {
  /** Search-param name for the lower bound (e.g. `"priceMin"`). */
  paramMin: string;
  /** Search-param name for the upper bound (e.g. `"priceMax"`). */
  paramMax: string;
  /** Static or memoized `[min, max]` tuple — values equal to bounds are dropped from the URL on commit. */
  bounds: [number, number];
  /** Extra params cleared on commit (e.g. `["page"]` to reset pagination). */
  resetParams?: string[];
  /** Optional callback fired after `router.push` (e.g. close mobile sheet). */
  onApply?: () => void;
}

/**
 * Encapsulates the (URL ↔ slider state) wiring used by the catalog and
 * lots filter forms. Returns `value` (drag state), `setValue` (passed as
 * `onChange` to RangeWithInputs) and `commit` (passed as `onCommit`,
 * pushes to URL).
 *
 * Pass `bounds` from a stable reference (constant or `useState` value).
 * Fresh literals on each render will re-trigger the URL→state sync.
 */
export function useUrlSyncedRange({
  paramMin,
  paramMax,
  bounds,
  resetParams,
  onApply,
}: UrlSyncedRangeOptions) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const urlMin = searchParams.get(paramMin);
  const urlMax = searchParams.get(paramMax);
  // Depend on the numeric values, not the tuple reference — callers passing a
  // fresh `[a, b]` literal each render would otherwise re-trigger the effect
  // and cause an infinite render loop.
  const boundsLo = bounds[0];
  const boundsHi = bounds[1];

  const [value, setValue] = useState<[number, number]>([
    urlMin ? Number(urlMin) : boundsLo,
    urlMax ? Number(urlMax) : boundsHi,
  ]);

  // Sync state ← URL when URL changes externally (clear-all, navigation,
  // bounds fetched async).
  useEffect(() => {
    setValue([
      urlMin ? Number(urlMin) : boundsLo,
      urlMax ? Number(urlMax) : boundsHi,
    ]);
  }, [urlMin, urlMax, boundsLo, boundsHi]);

  const commit = useCallback(
    (next: [number, number]) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next[0] > boundsLo) params.set(paramMin, String(next[0]));
      else params.delete(paramMin);
      if (next[1] < boundsHi) params.set(paramMax, String(next[1]));
      else params.delete(paramMax);
      if (resetParams) {
        for (const key of resetParams) params.delete(key);
      }
      router.push(`${pathname}?${params.toString()}`);
      onApply?.();
    },
    [
      router,
      pathname,
      searchParams,
      paramMin,
      paramMax,
      boundsLo,
      boundsHi,
      resetParams,
      onApply,
    ],
  );

  return { value, setValue, commit, bounds };
}
