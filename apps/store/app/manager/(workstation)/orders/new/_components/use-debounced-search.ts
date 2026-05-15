"use client";

import { useEffect, useState } from "react";

/**
 * Debounced search hook — повертає `debouncedQuery` що оновлюється після
 * `delay` ms тиші. Use case: autocomplete без spam-у API.
 */
export function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timeout = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timeout);
  }, [value, delay]);

  return debounced;
}
