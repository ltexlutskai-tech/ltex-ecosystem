import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";

export function WishlistScreen() {
  return (
    <View style={styles.container}>
      <Ionicons name="heart-outline" size={48} color="#d1d5db" />
      <Text style={styles.title}>У обраному поки порожньо</Text>
      <Text style={styles.subtitle}>
        Додавайте товари з каталогу — вони з&apos;являться тут для швидкого
        доступу.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
    backgroundColor: "#f9fafb",
    gap: 12,
  },
  title: { fontSize: 18, fontWeight: "600", color: "#111827" },
  subtitle: { fontSize: 14, color: "#6b7280", textAlign: "center" },
});
