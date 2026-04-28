import React, { useState } from "react";
import {
  Modal,
  View,
  Text,
  Image,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Pressable,
  Dimensions,
  FlatList,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { WebCatalogProduct } from "@/lib/api";
import { useWishlist } from "@/lib/wishlist";
import { COUNTRY_LABELS, QUALITY_LABELS, SEASON_LABELS } from "@/lib/labels";

interface QuickViewModalProps {
  product: WebCatalogProduct | null;
  onClose: () => void;
  onViewFull: (product: WebCatalogProduct) => void;
}

const SCREEN_WIDTH = Dimensions.get("window").width;
const SCREEN_HEIGHT = Dimensions.get("window").height;
const IMAGE_HEIGHT = (SCREEN_WIDTH * 3) / 4;

export function QuickViewModal({
  product,
  onClose,
  onViewFull,
}: QuickViewModalProps) {
  const { has, toggle } = useWishlist();
  const [activeIndex, setActiveIndex] = useState(0);

  if (!product) return null;

  const inList = has(product.id);
  const wholesalePrice = product.prices.find(
    (p) => p.priceType === "wholesale",
  );
  const akciyaPrice = product.prices.find((p) => p.priceType === "akciya");
  const images = product.images;

  const onMomentumScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
    if (idx !== activeIndex) setActiveIndex(idx);
  };

  const qualityLabel = QUALITY_LABELS[product.quality] ?? product.quality;
  const seasonLabel =
    product.season && product.season in SEASON_LABELS
      ? SEASON_LABELS[product.season]
      : product.season;
  const countryLabel =
    product.country && product.country in COUNTRY_LABELS
      ? COUNTRY_LABELS[product.country]
      : product.country;

  const metaParts = [qualityLabel, seasonLabel, countryLabel].filter(Boolean);
  const priceUnitLabel = product.priceUnit === "kg" ? "/кг" : "/шт";

  return (
    <Modal
      visible={true}
      transparent
      animationType="slide"
      presentationStyle="overFullScreen"
      onRequestClose={onClose}
    >
      <View style={styles.root}>
        <Pressable
          style={styles.backdrop}
          onPress={onClose}
          accessibilityLabel="Закрити"
        />
        <View style={styles.sheet}>
          <View style={styles.handle} />

          <View style={styles.imageBox}>
            {images.length > 0 ? (
              <FlatList
                data={images}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                onMomentumScrollEnd={onMomentumScrollEnd}
                keyExtractor={(item, i) => `${item.url}-${i}`}
                renderItem={({ item }) => (
                  <Image
                    source={{ uri: item.url }}
                    style={styles.image}
                    resizeMode="cover"
                  />
                )}
              />
            ) : (
              <View style={styles.imagePlaceholder}>
                <Text style={styles.imagePlaceholderText}>Без фото</Text>
              </View>
            )}

            {akciyaPrice ? (
              <View style={styles.saleBadge}>
                <Text style={styles.saleBadgeText}>SALE</Text>
              </View>
            ) : null}

            <TouchableOpacity
              style={styles.heartBtn}
              onPress={() => toggle(product)}
              hitSlop={8}
              accessibilityLabel={
                inList ? "Видалити з обраного" : "Додати в обране"
              }
            >
              <Ionicons
                name={inList ? "heart" : "heart-outline"}
                size={26}
                color={inList ? "#dc2626" : "#fff"}
              />
            </TouchableOpacity>

            {images.length > 1 ? (
              <View style={styles.dotsContainer} pointerEvents="none">
                {images.map((_, i) => (
                  <View
                    key={i}
                    style={[styles.dot, i === activeIndex && styles.dotActive]}
                  />
                ))}
              </View>
            ) : null}
          </View>

          <ScrollView
            style={styles.content}
            contentContainerStyle={styles.contentInner}
          >
            <Text style={styles.name} numberOfLines={2}>
              {product.name}
            </Text>
            {metaParts.length > 0 ? (
              <Text style={styles.meta}>{metaParts.join(" · ")}</Text>
            ) : null}

            <View style={styles.prices}>
              {akciyaPrice ? (
                <View style={styles.priceRow}>
                  <Text style={styles.priceLabel}>Акційна:</Text>
                  <Text style={styles.priceValueSale}>
                    €{akciyaPrice.amount.toFixed(2)}
                    {priceUnitLabel}
                  </Text>
                </View>
              ) : null}
              {wholesalePrice ? (
                <View style={styles.priceRow}>
                  <Text style={styles.priceLabel}>Опт:</Text>
                  <Text style={styles.priceValue}>
                    €{wholesalePrice.amount.toFixed(2)}
                    {priceUnitLabel}
                  </Text>
                </View>
              ) : null}
            </View>

            {product._count.lots > 0 ? (
              <Text style={styles.lotsText}>
                Лотів у наявності: {product._count.lots}
              </Text>
            ) : (
              <Text style={styles.outOfStockText}>Немає в наявності</Text>
            )}
          </ScrollView>

          <View style={styles.actions}>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
              <Text style={styles.closeBtnText}>Закрити</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.viewBtn}
              onPress={() => {
                onClose();
                onViewFull(product);
              }}
            >
              <Text style={styles.viewBtnText}>Дивитись повністю</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  sheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    maxHeight: SCREEN_HEIGHT * 0.85,
    backgroundColor: "#fff",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingTop: 8,
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: "#d1d5db",
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 12,
  },
  imageBox: {
    width: SCREEN_WIDTH,
    height: IMAGE_HEIGHT,
    backgroundColor: "#f3f4f6",
    position: "relative",
  },
  image: {
    width: SCREEN_WIDTH,
    height: IMAGE_HEIGHT,
  },
  imagePlaceholder: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  imagePlaceholderText: {
    fontSize: 13,
    color: "#9ca3af",
  },
  saleBadge: {
    position: "absolute",
    top: 12,
    left: 12,
    backgroundColor: "#dc2626",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  saleBadgeText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 12,
  },
  heartBtn: {
    position: "absolute",
    top: 12,
    right: 12,
    backgroundColor: "rgba(0,0,0,0.45)",
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  dotsContainer: {
    position: "absolute",
    bottom: 8,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "center",
    gap: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "rgba(255,255,255,0.5)",
  },
  dotActive: {
    backgroundColor: "#fff",
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  contentInner: {
    paddingBottom: 16,
  },
  name: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 4,
  },
  meta: {
    fontSize: 13,
    color: "#6b7280",
    marginBottom: 12,
  },
  prices: {
    gap: 6,
    marginBottom: 12,
  },
  priceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  priceLabel: {
    fontSize: 14,
    color: "#6b7280",
  },
  priceValue: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
  },
  priceValueSale: {
    fontSize: 16,
    fontWeight: "700",
    color: "#dc2626",
  },
  lotsText: {
    fontSize: 13,
    color: "#10b981",
    fontWeight: "500",
  },
  outOfStockText: {
    fontSize: 13,
    color: "#9ca3af",
  },
  actions: {
    flexDirection: "row",
    gap: 8,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
  },
  closeBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: "center",
    borderRadius: 8,
    backgroundColor: "#f3f4f6",
  },
  closeBtnText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#374151",
  },
  viewBtn: {
    flex: 2,
    paddingVertical: 12,
    alignItems: "center",
    borderRadius: 8,
    backgroundColor: "#16a34a",
  },
  viewBtnText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#fff",
  },
});
