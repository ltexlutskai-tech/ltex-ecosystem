"use client";

import { useState, useEffect } from "react";

export function OrdersBadge() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    async function fetch_() {
      try {
        const res = await fetch("/api/admin/stats");
        if (res.ok) {
          const data = await res.json();
          setCount(data.pendingOrders ?? 0);
        }
      } catch {}
    }
    fetch_();
    const timer = setInterval(fetch_, 30_000);
    return () => clearInterval(timer);
  }, []);

  if (count === 0) return null;

  return (
    <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">
      {count > 99 ? "99+" : count}
    </span>
  );
}
