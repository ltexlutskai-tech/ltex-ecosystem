import React from "react";
import { View, Text, TouchableOpacity, Image, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { WebCatalogProduct } from "@/lib/api";
import { QUALITY_LABELS, SEASON_LABELS } from "@/lib/labels";

// Re-export so existing imports from "@/components/ProductCard" still work.
export type { WebCatalogProduct } from "@/lib/api";

const NEW_BADGE_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

interface ProductCardProps {
  product: WebCatalogProduct;
  onPress: (product: WebCatalogProduct) => void;
  onWishlistToggle?: (product: WebCatalogProduct) => void;
  isWishlisted?: boolean;
}

export function ProductCard({
  product,
  onPress,
  onWishlistToggle,
  isWishlisted = false,
}: ProductCardProps) {
  const wholesalePrice = product.prices.find(
    (p) => p.priceType === "wholesale",
  );
  const firstImage = product.images[0];

  const isNew = product.createdAt
    ? Date.now() - new Date(product.createdAt).getTime() < NEW_BADGE_WINDOW_MS
    : false;
  const hasSale = product.prices.some((p) => p.priceType === "akciya");

  const qualityLabel = QUALITY_LABELS[product.quality] ?? product.quality;
  const seasonLabel =
    product.season && product.season in SEASON_LABELS
      ? SEASON_LABELS[product.season]
      : product.season;
  const priceUnitLabel = product.priceUnit === "kg" ? "/кг" : "/шт";

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => onPress(product)}
      activeOpacity={0.85}
    >
      <View style={styles.imageContainer}>
        {firstImage ? (
          <Image
            source={{ uri: firstImage.url }}
            style={styles.image}
            resizeMode="cover"
          />
        ) : (
          <View style={styles.imagePlaceholder}>
            <Text style={styles.imagePlaceholderText}>
              {product.videoUrl ? "Video" : "Без фото"}
            </Text>
          </View>
        )}

        {/* NEW / SALE badges — top-left */}
        {(isNew || hasSale) && (
          <View style={styles.badgeStack}>
            {isNew && (
              <View style={[styles.cornerBadge, styles.newBadge]}>
                <Text style={styles.cornerBadgeText}>NEW</Text>
              </View>
            )}
            {hasSale && (
              <View style={[styles.cornerBadge, styles.saleBadge]}>
                <Text style={styles.cornerBadgeText}>SALE</Text>
              </View>
            )}
          </View>
        )}

        {/* Wishlist heart — top-right.
            React Native does not bubble Touchable events to outer Touchables,
            so the parent card press is not triggered when this is tapped. */}
        <TouchableOpacity
          style={styles.heartButton}
          onPress={() => {
            onWishlistToggle?.(product);
          }}
          hitSlop={8}
          accessibilityLabel="Додати в обране"
        >
          <Ionicons
            name={isWishlisted ? "heart" : "heart-outline"}
            size={20}
            color={isWishlisted ? "#dc2626" : "#1f2937"}
          />
        </TouchableOpacity>
      </View>

      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={2}>
          {product.name}
        </Text>

        <View style={styles.chipRow}>
          <View style={styles.chip}>
            <Text style={styles.chipText}>{qualityLabel}</Text>
          </View>
          {product.season ? (
            <View style={styles.chip}>
              <Text style={styles.chipText}>{seasonLabel}</Text>
            </View>
          ) : null}
        </View>

        {wholesalePrice && (
          <View style={styles.priceRow}>
            <Text style={styles.price}>
              €{wholesalePrice.amount.toFixed(2)}
              <Text style={styles.priceUnit}>{priceUnitLabel}</Text>
            </Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: 10,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  imageContainer: {
    width: "100%",
    aspectRatio: 4 / 3,
    backgroundColor: "#f3f4f6",
    position: "relative",
  },
  image: {
    width: "100%",
    height: "100%",
  },
  imagePlaceholder: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  imagePlaceholderText: {
    fontSize: 12,
    color: "#9ca3af",
  },
  badgeStack: {
    position: "absolute",
    top: 6,
    left: 6,
    flexDirection: "column",
    gap: 4,
  },
  cornerBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  newBadge: {
    backgroundColor: "#2563eb",
  },
  saleBadge: {
    backgroundColor: "#dc2626",
  },
  cornerBadgeText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  heartButton: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(255, 255, 255, 0.9)",
    justifyContent: "center",
    alignItems: "center",
  },
  info: {
    padding: 10,
    gap: 6,
  },
  name: {
    fontSize: 13,
    fontWeight: "500",
    color: "#1f2937",
    lineHeight: 17,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
  },
  chip: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  chipText: {
    fontSize: 10,
    color: "#4b5563",
    fontWeight: "500",
  },
  priceRow: {
    marginTop: 2,
  },
  price: {
    fontSize: 18,
    fontWeight: "700",
    color: "#16a34a",
  },
  priceUnit: {
    fontSize: 11,
    fontWeight: "400",
    color: "#6b7280",
  },
});
