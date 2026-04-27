import React, { useCallback } from "react";
import { View, Text, FlatList, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ProductCard } from "@/components/ProductCard";
import type { WebCatalogProduct } from "@/lib/api";
import { useWishlist } from "@/lib/wishlist";

export function WishlistScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<any>>();
  const { items, toggle, isLoading } = useWishlist();

  const handlePress = useCallback(
    (product: WebCatalogProduct) => {
      navigation.navigate("ProductDetail", {
        productId: product.id,
        slug: product.slug,
        name: product.name,
      });
    },
    [navigation],
  );

  if (isLoading) {
    return <View style={styles.container} />;
  }

  if (items.length === 0) {
    return (
      <View style={[styles.container, styles.empty]}>
        <Ionicons name="heart-outline" size={48} color="#d1d5db" />
        <Text style={styles.title}>У обраному поки порожньо</Text>
        <Text style={styles.subtitle}>
          Додавайте товари з каталогу — вони з&apos;являться тут для швидкого
          доступу.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        extraData={items}
        numColumns={2}
        columnWrapperStyle={styles.row}
        renderItem={({ item }) => (
          <View style={styles.cardWrapper}>
            <ProductCard
              product={item}
              onPress={handlePress}
              isWishlisted={true}
              onWishlistToggle={toggle}
            />
          </View>
        )}
        contentContainerStyle={styles.listContent}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f9fafb",
  },
  empty: {
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
    gap: 12,
  },
  title: { fontSize: 18, fontWeight: "600", color: "#111827" },
  subtitle: { fontSize: 14, color: "#6b7280", textAlign: "center" },
  row: {
    gap: 8,
    paddingHorizontal: 12,
  },
  cardWrapper: {
    flex: 1,
  },
  listContent: {
    paddingTop: 12,
    paddingBottom: 24,
    gap: 8,
  },
});
