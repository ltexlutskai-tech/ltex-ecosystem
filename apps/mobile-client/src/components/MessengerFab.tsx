import React from "react";
import { TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";

const BRAND_COLOR = "#16a34a";

export function MessengerFab() {
  const navigation = useNavigation<any>();
  return (
    <TouchableOpacity
      style={styles.fab}
      onPress={() => navigation.navigate("MoreTab", { screen: "Chat" })}
      accessibilityLabel="Чат з менеджером"
      activeOpacity={0.8}
    >
      <Ionicons name="chatbubbles" size={26} color="#fff" />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: "absolute",
    right: 16,
    bottom: 72,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: BRAND_COLOR,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 6,
  },
});
