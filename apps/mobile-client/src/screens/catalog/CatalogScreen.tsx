import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { catalogApi, type WebCatalogProduct } from "@/lib/api";
import { useWishlist } from "@/lib/wishlist";
import { ProductCard } from "@/components/ProductCard";
import { CatalogSkeleton } from "@/components/SkeletonLoader";
import {
  CatalogFilterSheet,
  countActiveFilters,
  type CatalogFilters,
} from "@/components/CatalogFilterSheet";
import { QuickViewModal } from "@/components/QuickViewModal";

// SecureStore is loaded lazily so the screen still renders on web (where the
// module is unavailable). Same pattern as wishlist-provider.tsx.
let SecureStore: typeof import("expo-secure-store") | null = null;
try {
  SecureStore = require("expo-secure-store");
} catch {
  // Web fallback
}

const LAYOUT_MODE_KEY = "mobile.catalogListMode";

type LayoutMode = "grid" | "list";

interface CatalogScreenProps {
  navigation: {
    navigate: (screen: string, params?: Record<string, unknown>) => void;
  };
}

/**
 * Build the params object passed to /api/catalog from the local filter state.
 * The API expects all values as strings (URLSearchParams).
 */
function buildQueryParams(
  filters: CatalogFilters,
  page: number,
): Record<string, string> {
  const params: Record<string, string> = {
    page: String(page),
    limit: "20",
  };
  if (filters.q && filters.q.trim()) params.q = filters.q.trim();
  if (filters.category) params.categorySlug = filters.category;
  if (filters.subcategory) params.subcategorySlug = filters.subcategory;
  if (filters.qualities && filters.qualities.length > 0)
    params.quality = filters.qualities.join(",");
  if (filters.season) params.season = filters.season;
  if (filters.countries && filters.countries.length > 0)
    params.country = filters.countries.join(",");
  if (filters.sort) params.sort = filters.sort;
  if (filters.priceMin !== undefined)
    params.priceMin = String(filters.priceMin);
  if (filters.priceMax !== undefined)
    params.priceMax = String(filters.priceMax);
  if (filters.inStock) params.inStock = "true";
  return params;
}

export function CatalogScreen({ navigation }: CatalogScreenProps) {
  const [products, setProducts] = useState<WebCatalogProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filters, setFilters] = useState<CatalogFilters>({});
  // Search bar (in header) is wired straight into filters.q for instant feedback.
  const [searchInput, setSearchInput] = useState("");
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [layoutMode, setLayoutMode] = useState<LayoutMode>("grid");
  const [quickViewProduct, setQuickViewProduct] =
    useState<WebCatalogProduct | null>(null);
  const {
    items: wishlistItems,
    has: isWishlisted,
    toggle: toggleWishlist,
  } = useWishlist();

  // Load persisted layout preference once on mount.
  useEffect(() => {
    if (!SecureStore) return;
    SecureStore.getItemAsync(LAYOUT_MODE_KEY)
      .then((stored) => {
        if (stored === "list" || stored === "grid") setLayoutMode(stored);
      })
      .catch(() => {
        // Best-effort; default stays "grid".
      });
  }, []);

  const toggleLayout = useCallback(() => {
    setLayoutMode((prev) => {
      const next: LayoutMode = prev === "grid" ? "list" : "grid";
      if (SecureStore) {
        SecureStore.setItemAsync(LAYOUT_MODE_KEY, next).catch(() => {});
      }
      return next;
    });
  }, []);

  const fetchProducts = useCallback(
    async (pageNum: number, isRefresh = false) => {
      try {
        setError(null);
        const params = buildQueryParams(filters, pageNum);
        const data = await catalogApi.products(params);

        const fetched = data.products ?? [];
        if (isRefresh || pageNum === 1) {
          setProducts(fetched);
        } else {
          setProducts((prev) => [...prev, ...fetched]);
        }
        setHasMore(pageNum < (data.totalPages ?? 1));
      } catch {
        setError(
          "Не вдалося завантажити товари. Потягніть вниз для оновлення.",
        );
      }
    },
    [filters],
  );

  useEffect(() => {
    setPage(1);
    setLoading(true);
    fetchProducts(1).finally(() => setLoading(false));
  }, [filters, fetchProducts]);

  // Debounce search input → filters.q
  useEffect(() => {
    const trimmed = searchInput.trim();
    const current = filters.q ?? "";
    if (trimmed === current) return;
    const id = setTimeout(() => {
      setFilters((prev) => ({ ...prev, q: trimmed || undefined }));
    }, 350);
    return () => clearTimeout(id);
  }, [searchInput, filters.q]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    setPage(1);
    await fetchProducts(1, true);
    setRefreshing(false);
  }, [fetchProducts]);

  const handleLoadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    const nextPage = page + 1;
    setPage(nextPage);
    await fetchProducts(nextPage);
    setLoadingMore(false);
  }, [loadingMore, hasMore, page, fetchProducts]);

  const handleProductPress = useCallback(
    (product: WebCatalogProduct) => {
      navigation.navigate("ProductDetail", {
        productId: product.id,
        slug: product.slug,
        name: product.name,
      });
    },
    [navigation],
  );

  const handleApplyFilters = useCallback((next: CatalogFilters) => {
    setFilters(next);
    setSearchInput(next.q ?? "");
  }, []);

  const activeCount = countActiveFilters(filters);
  const isGrid = layoutMode === "grid";

  return (
    <View style={styles.container}>
      {/* Header: search input + layout toggle + filter button */}
      <View style={styles.headerRow}>
        <View style={styles.searchInputWrap}>
          <Ionicons
            name="search"
            size={16}
            color="#9ca3af"
            style={styles.searchIcon}
          />
          <TextInput
            style={styles.searchInput}
            placeholder="Пошук товарів..."
            placeholderTextColor="#9ca3af"
            value={searchInput}
            onChangeText={setSearchInput}
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
        </View>
        <TouchableOpacity
          style={styles.iconButton}
          onPress={toggleLayout}
          accessibilityLabel={
            isGrid ? "Переключити на список" : "Переключити на сітку"
          }
          activeOpacity={0.7}
        >
          <Ionicons name={isGrid ? "list" : "grid"} size={22} color="#1f2937" />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.iconButton}
          onPress={() => setFilterSheetOpen(true)}
          accessibilityLabel="Відкрити фільтри"
          activeOpacity={0.7}
        >
          <Ionicons name="options-outline" size={22} color="#1f2937" />
          {activeCount > 0 ? (
            <View style={styles.filterBadge}>
              <Text style={styles.filterBadgeText}>{activeCount}</Text>
            </View>
          ) : null}
        </TouchableOpacity>
      </View>

      {/* Product grid */}
      {loading ? (
        <CatalogSkeleton />
      ) : error && products.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : (
        <FlatList
          data={products}
          // FlatList caches by numColumns — changing it requires a key change
          // so the internal renderer is re-created from scratch.
          key={layoutMode}
          keyExtractor={(item) => item.id}
          extraData={wishlistItems}
          numColumns={isGrid ? 2 : 1}
          columnWrapperStyle={isGrid ? styles.row : undefined}
          renderItem={({ item }) => (
            <View style={isGrid ? styles.cardWrapper : styles.cardWrapperList}>
              <ProductCard
                product={item}
                onPress={handleProductPress}
                onLongPress={setQuickViewProduct}
                isWishlisted={isWishlisted(item.id)}
                onWishlistToggle={toggleWishlist}
                layout={layoutMode}
              />
            </View>
          )}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor="#16a34a"
              colors={["#16a34a"]}
            />
          }
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.3}
          ListFooterComponent={
            loadingMore ? (
              <View style={styles.footer}>
                <ActivityIndicator size="small" color="#16a34a" />
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.centered}>
              <Ionicons name="search-outline" size={48} color="#d1d5db" />
              <Text style={styles.emptyText}>Товарів не знайдено</Text>
              <Text style={styles.emptyHint}>
                Спробуйте змінити пошук або фільтри
              </Text>
            </View>
          }
          contentContainerStyle={
            products.length === 0 ? styles.emptyList : styles.listContent
          }
        />
      )}

      <CatalogFilterSheet
        visible={filterSheetOpen}
        onClose={() => setFilterSheetOpen(false)}
        initialFilters={filters}
        onApply={handleApplyFilters}
      />

      <QuickViewModal
        product={quickViewProduct}
        onClose={() => setQuickViewProduct(null)}
        onViewFull={handleProductPress}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f9fafb",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 8,
  },
  searchInputWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 10,
    paddingHorizontal: 12,
  },
  searchIcon: {
    marginRight: 6,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 9,
    fontSize: 14,
    color: "#1f2937",
  },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  filterBadge: {
    position: "absolute",
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#16a34a",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  filterBadgeText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "700",
  },
  row: {
    gap: 8,
    paddingHorizontal: 12,
  },
  cardWrapper: {
    flex: 1,
  },
  cardWrapperList: {
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  listContent: {
    paddingTop: 4,
    paddingBottom: 24,
    gap: 8,
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#4b5563",
  },
  emptyHint: {
    marginTop: 4,
    fontSize: 13,
    color: "#9ca3af",
  },
  errorText: {
    fontSize: 14,
    color: "#dc2626",
    textAlign: "center",
    lineHeight: 20,
  },
  emptyList: {
    flexGrow: 1,
  },
  footer: {
    paddingVertical: 16,
    alignItems: "center",
  },
});
