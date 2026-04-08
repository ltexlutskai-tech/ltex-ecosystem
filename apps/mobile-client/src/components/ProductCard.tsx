import React from "react";
import { View, Text, TouchableOpacity, Image, StyleSheet } from "react-native";

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

export interface ProductCardItem {
  id: string;
  name: string;
  slug: string;
  quality: string;
  priceUnit: string;
  imageUrls: string[];
  season: string;
  lotsCount?: number;
  minPriceEur?: number;
}

interface ProductCardProps {
  product: ProductCardItem;
  onPress: (product: ProductCardItem) => void;
}

export function ProductCard({ product, onPress }: ProductCardProps) {
  const qualityLabel = QUALITY_LABELS[product.quality] ?? product.quality;
  const qualityColor = QUALITY_COLORS[product.quality] ?? "#6b7280";
  const priceUnitLabel = product.priceUnit === "kg" ? "€/кг" : "€/шт";
  const hasImage = product.imageUrls && product.imageUrls.length > 0;

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => onPress(product)}
      activeOpacity={0.7}
    >
      <View style={styles.imageContainer}>
        {hasImage ? (
          <Image
            source={{ uri: product.imageUrls[0] }}
            style={styles.image}
            resizeMode="cover"
          />
        ) : (
          <View style={styles.imagePlaceholder}>
            <Text style={styles.imagePlaceholderText}>L-TEX</Text>
          </View>
        )}
        <View style={[styles.qualityBadge, { backgroundColor: qualityColor }]}>
          <Text style={styles.qualityBadgeText}>{qualityLabel}</Text>
        </View>
      </View>

      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={2}>
          {product.name}
        </Text>

        <View style={styles.row}>
          {product.minPriceEur != null && (
            <Text style={styles.price}>
              від {product.minPriceEur.toFixed(2)} {priceUnitLabel}
            </Text>
          )}
        </View>

        <View style={styles.row}>
          {product.lotsCount != null && product.lotsCount > 0 && (
            <View style={styles.lotsTag}>
              <Text style={styles.lotsTagText}>
                {product.lotsCount} {lotWord(product.lotsCount)}
              </Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

function lotWord(n: number): string {
  if (n % 10 === 1 && n % 100 !== 11) return "мішок";
  if ([2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100))
    return "мішки";
  return "мішків";
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    marginHorizontal: 16,
    marginVertical: 6,
    overflow: "hidden",
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  imageContainer: {
    height: 140,
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
    fontSize: 20,
    fontWeight: "bold",
    color: "#d1d5db",
  },
  qualityBadge: {
    position: "absolute",
    top: 8,
    left: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  qualityBadgeText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "700",
  },
  info: {
    padding: 12,
    gap: 4,
  },
  name: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1f2937",
    lineHeight: 20,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  price: {
    fontSize: 15,
    fontWeight: "700",
    color: "#16a34a",
  },
  lotsTag: {
    backgroundColor: "#f0fdf4",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  lotsTagText: {
    fontSize: 12,
    color: "#16a34a",
    fontWeight: "500",
  },
});
