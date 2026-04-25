import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";

export function NotificationsScreen() {
  return (
    <View style={styles.container}>
      <Ionicons name="notifications-outline" size={48} color="#d1d5db" />
      <Text style={styles.title}>Поки немає сповіщень</Text>
      <Text style={styles.subtitle}>
        Тут з&apos;являться оновлення про замовлення, нові товари та
        відеоогляди.
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
