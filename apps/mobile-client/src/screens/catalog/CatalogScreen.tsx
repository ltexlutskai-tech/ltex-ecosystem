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
import { catalogApi } from "@/lib/api";
import { ProductCard, type ProductCardItem } from "@/components/ProductCard";
import { CatalogSkeleton } from "@/components/SkeletonLoader";

const QUALITY_FILTERS = [
  { key: "all", label: "Всі" },
  { key: "extra", label: "Екстра" },
  { key: "cream", label: "Крем" },
  { key: "first", label: "1й сорт" },
  { key: "second", label: "2й сорт" },
  { key: "stock", label: "Сток" },
  { key: "mix", label: "Мікс" },
] as const;

interface CatalogScreenProps {
  navigation: {
    navigate: (screen: string, params?: Record<string, unknown>) => void;
  };
}

export function CatalogScreen({ navigation }: CatalogScreenProps) {
  const [products, setProducts] = useState<ProductCardItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [quality, setQuality] = useState("all");
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchProducts = useCallback(
    async (pageNum: number, isRefresh = false) => {
      try {
        setError(null);
        const params: Record<string, string> = {
          page: String(pageNum),
          limit: "20",
        };
        if (search.trim()) params.q = search.trim();
        if (quality !== "all") params.quality = quality;

        const data = (await catalogApi.products(params)) as {
          products: ProductCardItem[];
          total: number;
          page: number;
          totalPages: number;
        };

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
    [search, quality],
  );

  useEffect(() => {
    setPage(1);
    setLoading(true);
    fetchProducts(1).finally(() => setLoading(false));
  }, [search, quality, fetchProducts]);

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
    (product: ProductCardItem) => {
      navigation.navigate("ProductDetail", {
        productId: product.id,
        slug: product.slug,
        name: product.name,
      });
    },
    [navigation],
  );

  return (
    <View style={styles.container}>
      {/* Search bar */}
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Пошук товарів..."
          placeholderTextColor="#9ca3af"
          value={search}
          onChangeText={setSearch}
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
      </View>

      {/* Quality filter chips */}
      <FlatList
        data={QUALITY_FILTERS}
        horizontal
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item) => item.key}
        contentContainerStyle={styles.filtersContainer}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[
              styles.filterChip,
              quality === item.key && styles.filterChipActive,
            ]}
            onPress={() => setQuality(item.key)}
          >
            <Text
              style={[
                styles.filterChipText,
                quality === item.key && styles.filterChipTextActive,
              ]}
            >
              {item.label}
            </Text>
          </TouchableOpacity>
        )}
      />

      {/* Product list */}
      {loading ? (
        <CatalogSkeleton />
      ) : error && products.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : (
        <FlatList
          data={products}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <ProductCard product={item} onPress={handleProductPress} />
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
            products.length === 0 ? styles.emptyList : undefined
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f9fafb",
  },
  searchContainer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  searchInput: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    color: "#1f2937",
  },
  filtersContainer: {
    paddingHorizontal: 16,
    paddingBottom: 8,
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  filterChipActive: {
    backgroundColor: "#16a34a",
    borderColor: "#16a34a",
  },
  filterChipText: {
    fontSize: 13,
    color: "#4b5563",
    fontWeight: "500",
  },
  filterChipTextActive: {
    color: "#fff",
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: "#6b7280",
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
