import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Image,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Linking,
  FlatList,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/lib/auth";
import {
  catalogApi,
  favoritesApi,
  notificationsApi,
  productsApi,
} from "@/lib/api";
import { ProductSkeleton } from "@/components/SkeletonLoader";

const QUALITY_LABELS: Record<string, string> = {
  extra: "Екстра",
  cream: "Крем",
  first: "1й сорт",
  second: "2й сорт",
  stock: "Сток",
  mix: "Мікс",
};

const QUALITY_COLORS: Record<string, string> = {
  extra: "#7c3aed",
  cream: "#d97706",
  first: "#16a34a",
  second: "#2563eb",
  stock: "#dc2626",
  mix: "#6b7280",
};

const SEASON_LABELS: Record<string, string> = {
  winter: "Зима",
  summer: "Літо",
  demiseason: "Демісезон",
  "": "Всесезон",
};

const LOT_STATUS_LABELS: Record<string, string> = {
  free: "Вільний",
  reserved: "Зарезервовано",
  on_sale: "Акція",
};

const LOT_STATUS_COLORS: Record<string, string> = {
  free: "#16a34a",
  reserved: "#d97706",
  on_sale: "#dc2626",
};

interface LotItem {
  id: string;
  barcode: string;
  weight: number;
  quantity: number;
  status: string;
  priceEur: number;
  videoUrl: string | null;
}

interface ProductDetail {
  id: string;
  name: string;
  slug: string;
  description: string;
  quality: string;
  season: string;
  priceUnit: string;
  averageWeight: number | null;
  imageUrls: string[];
  videoUrl: string | null;
  country: string;
  lots: LotItem[];
  prices: Array<{ priceType: string; currency: string; amount: number }>;
  isFavorite?: boolean;
  isSubscribedVideo?: boolean;
}

interface ProductScreenProps {
  route: {
    params: {
      productId: string;
      slug: string;
      name: string;
    };
  };
  navigation: {
    navigate: (screen: string, params?: Record<string, unknown>) => void;
    setOptions: (opts: Record<string, unknown>) => void;
  };
}

export function ProductScreen({ route, navigation }: ProductScreenProps) {
  const { productId } = route.params;
  const { customerId } = useAuth();

  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [isFavorite, setIsFavorite] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [favoriteLoading, setFavoriteLoading] = useState(false);
  const [subscribeLoading, setSubscribeLoading] = useState(false);
  const [cart, setCart] = useState<Record<string, boolean>>({});

  useEffect(() => {
    navigation.setOptions({ title: route.params.name });
  }, [navigation, route.params.name]);

  useEffect(() => {
    loadProduct();
  }, [productId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    productsApi.trackView(productId, "product_detail");
  }, [productId]);

  async function loadProduct() {
    setLoading(true);
    try {
      const data = (await catalogApi.products({
        productId,
        ...(customerId ? { customerId } : {}),
      })) as { product: ProductDetail };
      const p = data.product;
      setProduct(p);
      setIsFavorite(p.isFavorite ?? false);
      setIsSubscribed(p.isSubscribedVideo ?? false);
    } catch {
      Alert.alert("Помилка", "Не вдалось завантажити товар");
    } finally {
      setLoading(false);
    }
  }

  const toggleFavorite = useCallback(async () => {
    if (!customerId || !product) return;
    setFavoriteLoading(true);
    try {
      if (isFavorite) {
        await favoritesApi.remove(product.id);
        setIsFavorite(false);
      } else {
        await favoritesApi.add(product.id);
        setIsFavorite(true);
      }
    } catch {
      Alert.alert("Помилка", "Не вдалось оновити обране");
    } finally {
      setFavoriteLoading(false);
    }
  }, [customerId, product, isFavorite]);

  const toggleSubscribe = useCallback(async () => {
    if (!customerId || !product) return;
    setSubscribeLoading(true);
    try {
      if (isSubscribed) {
        await notificationsApi.unsubscribeVideo(product.id);
        setIsSubscribed(false);
      } else {
        await notificationsApi.subscribeVideo(product.id);
        setIsSubscribed(true);
      }
    } catch {
      Alert.alert("Помилка", "Не вдалось оновити підписку");
    } finally {
      setSubscribeLoading(false);
    }
  }, [customerId, product, isSubscribed]);

  const openVideo = useCallback((url: string) => {
    Linking.openURL(url).catch(() => {
      Alert.alert("Помилка", "Не вдалось відкрити відео");
    });
  }, []);

  const addToCart = useCallback((lot: LotItem) => {
    setCart((prev) => ({ ...prev, [lot.id]: true }));
    Alert.alert("Додано до кошика", `Мішок ${lot.barcode} (${lot.weight} кг)`);
  }, []);

  if (loading) {
    return <ProductSkeleton />;
  }

  if (!product) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Товар не знайдено</Text>
      </View>
    );
  }

  const qualityLabel = QUALITY_LABELS[product.quality] ?? product.quality;
  const qualityColor = QUALITY_COLORS[product.quality] ?? "#6b7280";
  const seasonLabel = SEASON_LABELS[product.season] ?? "";
  const priceUnitLabel = product.priceUnit === "kg" ? "€/кг" : "€/шт";
  const wholesalePrice = product.prices?.find(
    (p) => p.priceType === "wholesale",
  );
  const freeLots = product.lots?.filter((l) => l.status === "free") ?? [];
  const allLots = product.lots ?? [];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Image gallery */}
      {product.imageUrls.length > 0 ? (
        <FlatList
          data={product.imageUrls}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          keyExtractor={(_, i) => String(i)}
          renderItem={({ item }) => (
            <Image
              source={{ uri: item }}
              style={styles.productImage}
              resizeMode="cover"
            />
          )}
          style={styles.imageList}
        />
      ) : (
        <View style={styles.imagePlaceholder}>
          <Text style={styles.imagePlaceholderText}>L-TEX</Text>
        </View>
      )}

      {/* Title + favorite */}
      <View style={styles.titleRow}>
        <Text style={styles.productName}>{product.name}</Text>
        {customerId && (
          <TouchableOpacity
            onPress={toggleFavorite}
            disabled={favoriteLoading}
            style={styles.favoriteButton}
          >
            <Ionicons
              name={isFavorite ? "heart" : "heart-outline"}
              size={28}
              color={isFavorite ? "#dc2626" : "#9ca3af"}
            />
          </TouchableOpacity>
        )}
      </View>

      {/* Badges */}
      <View style={styles.badgeRow}>
        <View style={[styles.badge, { backgroundColor: qualityColor }]}>
          <Text style={styles.badgeText}>{qualityLabel}</Text>
        </View>
        {seasonLabel ? (
          <View style={[styles.badge, { backgroundColor: "#0284c7" }]}>
            <Text style={styles.badgeText}>{seasonLabel}</Text>
          </View>
        ) : null}
        {product.country ? (
          <View style={[styles.badge, { backgroundColor: "#6b7280" }]}>
            <Text style={styles.badgeText}>{product.country}</Text>
          </View>
        ) : null}
      </View>

      {/* Price */}
      {wholesalePrice && (
        <Text style={styles.priceText}>
          {wholesalePrice.amount.toFixed(2)} {priceUnitLabel}
        </Text>
      )}

      {product.averageWeight && (
        <Text style={styles.detailText}>
          Середня вага мішка: {product.averageWeight} кг
        </Text>
      )}

      {/* Description */}
      {product.description ? (
        <Text style={styles.descriptionText}>{product.description}</Text>
      ) : null}

      {/* YouTube video */}
      {product.videoUrl && (
        <TouchableOpacity
          style={styles.videoButton}
          onPress={() => openVideo(product.videoUrl!)}
        >
          <Ionicons name="logo-youtube" size={22} color="#dc2626" />
          <Text style={styles.videoButtonText}>Дивитись відео-огляд</Text>
        </TouchableOpacity>
      )}

      {/* Subscribe to video reviews */}
      {customerId && (
        <TouchableOpacity
          style={[
            styles.subscribeButton,
            isSubscribed && styles.subscribeButtonActive,
          ]}
          onPress={toggleSubscribe}
          disabled={subscribeLoading}
        >
          <Ionicons
            name={isSubscribed ? "notifications" : "notifications-outline"}
            size={18}
            color={isSubscribed ? "#fff" : "#16a34a"}
          />
          <Text
            style={[
              styles.subscribeButtonText,
              isSubscribed && styles.subscribeButtonTextActive,
            ]}
          >
            {isSubscribed
              ? "Підписка на відео-огляди активна"
              : "Підписатись на відео-огляди"}
          </Text>
        </TouchableOpacity>
      )}

      {/* Lots section */}
      <View style={styles.lotsSection}>
        <Text style={styles.sectionTitle}>
          Мішки ({freeLots.length} вільних з {allLots.length})
        </Text>

        {allLots.length === 0 ? (
          <Text style={styles.emptyLots}>Немає доступних мішків</Text>
        ) : (
          allLots.map((lot) => (
            <View key={lot.id} style={styles.lotCard}>
              <View style={styles.lotInfo}>
                <Text style={styles.lotBarcode}>{lot.barcode}</Text>
                <View style={styles.lotDetailsRow}>
                  <Text style={styles.lotDetail}>{lot.weight} кг</Text>
                  <Text style={styles.lotSep}>·</Text>
                  <Text style={styles.lotDetail}>{lot.quantity} шт</Text>
                  <Text style={styles.lotSep}>·</Text>
                  <Text style={styles.lotPrice}>
                    {lot.priceEur.toFixed(2)} €
                  </Text>
                </View>
                <View
                  style={[
                    styles.lotStatusBadge,
                    {
                      backgroundColor:
                        (LOT_STATUS_COLORS[lot.status] ?? "#6b7280") + "1a",
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.lotStatusText,
                      { color: LOT_STATUS_COLORS[lot.status] ?? "#6b7280" },
                    ]}
                  >
                    {LOT_STATUS_LABELS[lot.status] ?? lot.status}
                  </Text>
                </View>
              </View>

              <View style={styles.lotActions}>
                {lot.videoUrl && (
                  <TouchableOpacity
                    onPress={() => openVideo(lot.videoUrl!)}
                    style={styles.lotVideoButton}
                  >
                    <Ionicons name="logo-youtube" size={20} color="#dc2626" />
                  </TouchableOpacity>
                )}
                {lot.status === "free" && (
                  <TouchableOpacity
                    style={[
                      styles.addToCartButton,
                      cart[lot.id] && styles.addToCartButtonDone,
                    ]}
                    onPress={() => addToCart(lot)}
                    disabled={!!cart[lot.id]}
                  >
                    <Ionicons
                      name={cart[lot.id] ? "checkmark" : "cart-outline"}
                      size={18}
                      color="#fff"
                    />
                  </TouchableOpacity>
                )}
              </View>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  content: { paddingBottom: 40 },
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
  errorText: { fontSize: 16, color: "#6b7280" },

  imageList: { height: 260 },
  productImage: { width: 360, height: 260 },
  imagePlaceholder: {
    height: 200,
    backgroundColor: "#f3f4f6",
    justifyContent: "center",
    alignItems: "center",
  },
  imagePlaceholderText: { fontSize: 28, fontWeight: "bold", color: "#d1d5db" },

  titleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 8,
  },
  productName: {
    flex: 1,
    fontSize: 20,
    fontWeight: "700",
    color: "#1f2937",
    lineHeight: 26,
  },
  favoriteButton: { padding: 4 },

  badgeRow: {
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 16,
    marginTop: 10,
  },
  badge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 6 },
  badgeText: { color: "#fff", fontSize: 12, fontWeight: "600" },

  priceText: {
    fontSize: 22,
    fontWeight: "700",
    color: "#16a34a",
    paddingHorizontal: 16,
    marginTop: 12,
  },
  detailText: {
    fontSize: 13,
    color: "#6b7280",
    paddingHorizontal: 16,
    marginTop: 4,
  },
  descriptionText: {
    fontSize: 14,
    color: "#4b5563",
    lineHeight: 20,
    paddingHorizontal: 16,
    marginTop: 12,
  },

  videoButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 16,
    marginTop: 14,
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: "#fef2f2",
    borderRadius: 10,
  },
  videoButtonText: { fontSize: 14, fontWeight: "600", color: "#dc2626" },

  subscribeButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 16,
    marginTop: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: "#f0fdf4",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#16a34a",
  },
  subscribeButtonActive: { backgroundColor: "#16a34a" },
  subscribeButtonText: { fontSize: 13, fontWeight: "600", color: "#16a34a" },
  subscribeButtonTextActive: { color: "#fff" },

  lotsSection: { marginTop: 20, paddingHorizontal: 16 },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1f2937",
    marginBottom: 10,
  },
  emptyLots: {
    fontSize: 14,
    color: "#9ca3af",
    textAlign: "center",
    paddingVertical: 20,
  },

  lotCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f9fafb",
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  lotInfo: { flex: 1, gap: 4 },
  lotBarcode: { fontSize: 13, fontWeight: "600", color: "#374151" },
  lotDetailsRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  lotDetail: { fontSize: 13, color: "#6b7280" },
  lotSep: { fontSize: 13, color: "#d1d5db" },
  lotPrice: { fontSize: 13, fontWeight: "700", color: "#16a34a" },
  lotStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    alignSelf: "flex-start",
  },
  lotStatusText: { fontSize: 11, fontWeight: "600" },

  lotActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  lotVideoButton: { padding: 6 },
  addToCartButton: {
    backgroundColor: "#16a34a",
    borderRadius: 8,
    padding: 8,
  },
  addToCartButtonDone: { backgroundColor: "#6b7280" },
});
