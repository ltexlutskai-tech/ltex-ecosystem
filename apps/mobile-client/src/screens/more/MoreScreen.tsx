import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";

interface MoreItem {
  key: string;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  route: string;
  color: string;
}

const ITEMS: MoreItem[] = [
  {
    key: "profile",
    icon: "person-outline",
    label: "Профіль",
    route: "Profile",
    color: "#16a34a",
  },
  {
    key: "orders",
    icon: "receipt-outline",
    label: "Замовлення",
    route: "Orders",
    color: "#0284c7",
  },
  {
    key: "chat",
    icon: "chatbubbles-outline",
    label: "Чат з менеджером",
    route: "Chat",
    color: "#7c3aed",
  },
  {
    key: "shipments",
    icon: "cube-outline",
    label: "Відправлення",
    route: "Shipments",
    color: "#d97706",
  },
  {
    key: "subscriptions",
    icon: "notifications-outline",
    label: "Підписки",
    route: "Subscriptions",
    color: "#db2777",
  },
  {
    key: "payments",
    icon: "wallet-outline",
    label: "Історія оплат",
    route: "PaymentsHistory",
    color: "#0891b2",
  },
];

export function MoreScreen() {
  const navigation = useNavigation<any>();
  return (
    <ScrollView style={styles.container}>
      {ITEMS.map((item, idx) => (
        <TouchableOpacity
          key={item.key}
          onPress={() => navigation.navigate(item.route)}
          style={[styles.row, idx === ITEMS.length - 1 && styles.rowLast]}
        >
          <View
            style={[styles.iconWrap, { backgroundColor: `${item.color}15` }]}
          >
            <Ionicons name={item.icon} size={22} color={item.color} />
          </View>
          <Text style={styles.label}>{item.label}</Text>
          <Ionicons name="chevron-forward" size={18} color="#9ca3af" />
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f9fafb" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
    gap: 12,
  },
  rowLast: { borderBottomWidth: 0 },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  label: { flex: 1, fontSize: 15, color: "#111827" },
});
