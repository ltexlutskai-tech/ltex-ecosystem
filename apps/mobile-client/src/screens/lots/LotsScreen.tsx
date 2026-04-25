import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";

export function LotsScreen() {
  return (
    <View style={styles.container}>
      <Ionicons name="cube-outline" size={48} color="#d1d5db" />
      <Text style={styles.title}>Список лотів — скоро</Text>
      <Text style={styles.subtitle}>
        Тут буде каталог окремих мішків з відеооглядами, вагою та штрихкодами.
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
