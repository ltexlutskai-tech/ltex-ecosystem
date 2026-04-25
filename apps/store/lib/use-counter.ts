"use client";

import { useEffect, useRef, useState } from "react";

interface UseCounterOptions {
  target: number;
  durationMs?: number;
  startWhenVisible?: boolean;
}

export function useCounter<T extends HTMLElement = HTMLDivElement>(
  options: UseCounterOptions,
): { value: number; ref: React.RefObject<T | null> } {
  const { target, durationMs = 1500, startWhenVisible = true } = options;
  const [value, setValue] = useState(0);
  const ref = useRef<T | null>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (target <= 0) {
      setValue(0);
      return;
    }

    const animate = () => {
      if (startedRef.current) return;
      startedRef.current = true;
      const start = performance.now();
      const tick = (now: number) => {
        const elapsed = now - start;
        const progress = Math.min(1, elapsed / durationMs);
        // ease-out cubic for nicer feel
        const eased = 1 - Math.pow(1 - progress, 3);
        setValue(Math.round(target * eased));
        if (progress < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    };

    if (!startWhenVisible) {
      animate();
      return;
    }

    const node = ref.current;
    if (!node || typeof IntersectionObserver === "undefined") {
      animate();
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            animate();
            observer.disconnect();
            break;
          }
        }
      },
      { threshold: 0.2 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [target, durationMs, startWhenVisible]);

  return { value, ref };
}
