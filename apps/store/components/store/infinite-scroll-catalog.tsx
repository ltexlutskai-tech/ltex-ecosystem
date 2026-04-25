"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { ProductCard, type ProductCardData } from "./product-card";
import { Loader2 } from "lucide-react";

interface InfiniteScrollCatalogProps {
  initialProducts: ProductCardData[];
  total: number;
  totalPages: number;
  perPage: number;
  filterParams: string;
  layout?: "grid" | "list";
}

export function InfiniteScrollCatalog({
  initialProducts,
  total,
  totalPages,
  perPage,
  filterParams,
  layout = "grid",
}: InfiniteScrollCatalogProps) {
  const [products, setProducts] = useState<ProductCardData[]>(initialProducts);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(totalPages > 1);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Reset when filters change
  useEffect(() => {
    setProducts(initialProducts);
    setPage(1);
    setHasMore(totalPages > 1);
  }, [initialProducts, totalPages]);

  const loadMore = useCallback(async () => {
    if (loading || !hasMore) return;
    setLoading(true);

    const nextPage = page + 1;
    const separator = filterParams ? "&" : "";
    const url = `/api/catalog?${filterParams}${separator}page=${nextPage}`;

    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setProducts((prev) => [...prev, ...data.products]);
      setPage(nextPage);
      setHasMore(nextPage < data.totalPages);
    } catch {
      // Silently fail — user can scroll back up
    } finally {
      setLoading(false);
    }
  }, [page, loading, hasMore, filterParams]);

  // Intersection Observer for sentinel element
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasMore && !loading) {
          loadMore();
        }
      },
      { rootMargin: "200px" },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadMore, hasMore, loading]);

  return (
    <>
      {layout === "list" ? (
        <div className="flex flex-col gap-4">
          {products.map((product) => (
            <ProductCard
              key={product.id ?? product.slug}
              product={product}
              mode="list"
            />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4">
          {products.map((product) => (
            <ProductCard
              key={product.id ?? product.slug}
              product={product}
              mode="grid"
            />
          ))}
        </div>
      )}

      {/* Sentinel element for intersection observer */}
      <div ref={sentinelRef} className="mt-4 flex justify-center py-4">
        {loading && (
          <div className="flex items-center gap-2 text-gray-500">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>Завантаження...</span>
          </div>
        )}
      </div>

      {!hasMore && products.length > perPage && (
        <p className="text-center text-sm text-gray-400">
          Показано всі {total} товарів
        </p>
      )}
    </>
  );
}
