import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import {
  homeApi,
  recommendationsApi,
  type MobileHomeData,
  type WebCatalogProduct,
} from "@/lib/api";
import { BannerCarousel } from "@/components/BannerCarousel";
import { HorizontalProductRail } from "@/components/HorizontalProductRail";
import { CatalogSkeleton } from "@/components/SkeletonLoader";

const BRAND_COLOR = "#16a34a";

const QUICK_ACTIONS: {
  key: string;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  route: string;
  color: string;
}[] = [
  {
    key: "catalog",
    icon: "grid-outline",
    label: "Каталог",
    route: "Catalog",
    color: "#16a34a",
  },
  {
    key: "lots",
    icon: "cube-outline",
    label: "Лоти",
    route: "Lots",
    color: "#0284c7",
  },
  {
    key: "notifications",
    icon: "notifications-outline",
    label: "Сповіщення",
    route: "Notifications",
    color: "#dc2626",
  },
  {
    key: "wishlist",
    icon: "heart-outline",
    label: "Обране",
    route: "Wishlist",
    color: "#db2777",
  },
];

export function HomeScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<any>>();
  const [searchQuery, setSearchQuery] = useState("");
  const [data, setData] = useState<MobileHomeData | null>(null);
  const [recommendations, setRecommendations] = useState<WebCatalogProduct[]>(
    [],
  );
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchHome = useCallback(async () => {
    try {
      setError(null);
      const [homeResult, recsResult] = await Promise.all([
        homeApi.get(),
        recommendationsApi.get().catch(() => ({ products: [] })),
      ]);
      setData(homeResult);
      setRecommendations(recsResult.products);
    } catch {
      setError("Не вдалося завантажити головну. Потягніть для оновлення.");
    }
  }, []);

  useEffect(() => {
    fetchHome().finally(() => setLoading(false));
  }, [fetchHome]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchHome();
    setRefreshing(false);
  }, [fetchHome]);

  const submitSearch = useCallback(() => {
    const q = searchQuery.trim();
    if (!q) return;
    navigation.getParent()?.navigate("SearchTab", {
      screen: "SearchMain",
      params: { q },
    });
  }, [navigation, searchQuery]);

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

  const goCatalog = useCallback(() => {
    navigation.navigate("Catalog");
  }, [navigation]);

  if (loading) {
    return (
      <View style={styles.container}>
        <CatalogSkeleton />
      </View>
    );
  }

  const banners = data?.banners ?? [];
  const featured = data?.featured ?? [];
  const onSale = data?.onSale ?? [];
  const newArrivals = data?.newArrivals ?? [];

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={handleRefresh}
          tintColor={BRAND_COLOR}
          colors={[BRAND_COLOR]}
        />
      }
    >
      {banners.length > 0 ? (
        <BannerCarousel banners={banners} />
      ) : (
        <View style={styles.fallbackBanner}>
          <Text style={styles.fallbackTitle}>L-TEX</Text>
          <Text style={styles.fallbackSubtitle}>
            Секонд хенд, сток, іграшки гуртом від 10 кг
          </Text>
        </View>
      )}

      <View style={styles.searchWrap}>
        <Ionicons name="search-outline" size={20} color="#9ca3af" />
        <TextInput
          style={styles.searchInput}
          placeholder="Пошук товарів..."
          placeholderTextColor="#9ca3af"
          value={searchQuery}
          onChangeText={setSearchQuery}
          returnKeyType="search"
          onSubmitEditing={submitSearch}
        />
      </View>

      <View style={styles.actionsRow}>
        {QUICK_ACTIONS.map((action) => (
          <TouchableOpacity
            key={action.key}
            style={styles.actionButton}
            onPress={() => navigation.navigate(action.route)}
            accessibilityLabel={action.label}
          >
            <View
              style={[
                styles.actionIconWrap,
                { backgroundColor: `${action.color}15` },
              ]}
            >
              <Ionicons name={action.icon} size={28} color={action.color} />
            </View>
            <Text style={styles.actionLabel} numberOfLines={1}>
              {action.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <HorizontalProductRail
        title="Топ товарів"
        products={featured}
        onProductPress={handleProductPress}
        onSeeAll={goCatalog}
      />
      <HorizontalProductRail
        title="Акції"
        products={onSale}
        onProductPress={handleProductPress}
        onSeeAll={goCatalog}
      />
      {recommendations.length > 0 && (
        <HorizontalProductRail
          title="Рекомендоване для вас"
          products={recommendations}
          onProductPress={handleProductPress}
          onSeeAll={goCatalog}
        />
      )}
      <HorizontalProductRail
        title="Новинки"
        products={newArrivals}
        onProductPress={handleProductPress}
        onSeeAll={goCatalog}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f9fafb" },
  content: { paddingBottom: 96 },
  fallbackBanner: {
    margin: 16,
    padding: 24,
    borderRadius: 16,
    backgroundColor: BRAND_COLOR,
    alignItems: "center",
  },
  fallbackTitle: {
    fontSize: 32,
    fontWeight: "bold",
    color: "#fff",
    letterSpacing: 2,
  },
  fallbackSubtitle: {
    fontSize: 14,
    color: "rgba(255,255,255,0.9)",
    marginTop: 8,
    textAlign: "center",
  },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    marginTop: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: "#111827",
  },
  actionsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    marginTop: 20,
  },
  actionButton: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: 4,
  },
  actionIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 6,
  },
  actionLabel: {
    fontSize: 12,
    color: "#374151",
    textAlign: "center",
  },
  errorText: {
    marginTop: 16,
    marginHorizontal: 16,
    fontSize: 13,
    color: "#dc2626",
    textAlign: "center",
  },
});
