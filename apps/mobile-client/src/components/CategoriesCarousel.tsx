import React from "react";
import {
  View,
  Text,
  FlatList,
  Pressable,
  StyleSheet,
  type ListRenderItemInfo,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { MobileHomeCategory } from "@/lib/api";

interface CategoriesCarouselProps {
  categories: MobileHomeCategory[];
  onPress: (category: MobileHomeCategory) => void;
}

export function CategoriesCarousel({
  categories,
  onPress,
}: CategoriesCarouselProps) {
  if (categories.length === 0) return null;

  const renderItem = ({ item }: ListRenderItemInfo<MobileHomeCategory>) => (
    <Pressable
      onPress={() => onPress(item)}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      accessibilityLabel={`Категорія ${item.name}, ${item.productCount} товарів`}
    >
      <View style={styles.iconBox}>
        <Ionicons name="grid-outline" size={28} color="#16a34a" />
      </View>
      <Text style={styles.name} numberOfLines={2}>
        {item.name}
      </Text>
      <Text style={styles.count}>{item.productCount} товарів</Text>
    </Pressable>
  );

  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <Text style={styles.title}>Категорії</Text>
      </View>
      <FlatList
        data={categories}
        keyExtractor={(c) => c.id}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.list}
        renderItem={renderItem}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: 24 },
  header: {
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: "600",
    color: "#111827",
  },
  list: {
    paddingHorizontal: 16,
    gap: 12,
  },
  card: {
    width: 120,
    paddingVertical: 14,
    paddingHorizontal: 10,
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    alignItems: "center",
  },
  cardPressed: {
    backgroundColor: "#f3f4f6",
  },
  iconBox: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#ecfdf5",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 8,
  },
  name: {
    fontSize: 13,
    fontWeight: "600",
    textAlign: "center",
    color: "#111827",
  },
  count: {
    fontSize: 11,
    color: "#6b7280",
    marginTop: 4,
  },
});
