import React, { useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  type ListRenderItemInfo,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ProductCard } from "@/components/ProductCard";
import type { WebCatalogProduct } from "@/lib/api";
import { useWishlist } from "@/lib/wishlist";

const CARD_WIDTH = 160;

interface HorizontalProductRailProps {
  title: string;
  products: WebCatalogProduct[];
  onProductPress: (product: WebCatalogProduct) => void;
  onProductLongPress?: (product: WebCatalogProduct) => void;
  onSeeAll?: () => void;
  emptyHint?: string;
}

export function HorizontalProductRail({
  title,
  products,
  onProductPress,
  onProductLongPress,
  onSeeAll,
  emptyHint,
}: HorizontalProductRailProps) {
  const { items: wishlistItems, has, toggle } = useWishlist();

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<WebCatalogProduct>) => (
      <View style={styles.cardWrapper}>
        <ProductCard
          product={item}
          onPress={onProductPress}
          onLongPress={onProductLongPress}
          isWishlisted={has(item.id)}
          onWishlistToggle={toggle}
        />
      </View>
    ),
    [onProductPress, onProductLongPress, has, toggle],
  );

  if (products.length === 0 && !emptyHint) return null;

  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        {onSeeAll ? (
          <TouchableOpacity
            onPress={onSeeAll}
            hitSlop={8}
            accessibilityLabel={`Усі: ${title}`}
          >
            <View style={styles.seeAllRow}>
              <Text style={styles.seeAllText}>Усі</Text>
              <Ionicons name="chevron-forward" size={16} color="#16a34a" />
            </View>
          </TouchableOpacity>
        ) : null}
      </View>

      {products.length === 0 && emptyHint ? (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyText}>{emptyHint}</Text>
        </View>
      ) : (
        <FlatList
          data={products}
          keyExtractor={(p) => p.id}
          extraData={wishlistItems}
          renderItem={renderItem}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginTop: 24,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: "600",
    color: "#111827",
  },
  seeAllRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  seeAllText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#16a34a",
  },
  listContent: {
    paddingHorizontal: 16,
    gap: 12,
  },
  cardWrapper: {
    width: CARD_WIDTH,
  },
  emptyBox: {
    marginHorizontal: 16,
    paddingVertical: 24,
    paddingHorizontal: 16,
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    alignItems: "center",
  },
  emptyText: {
    fontSize: 13,
    color: "#9ca3af",
    textAlign: "center",
  },
});
