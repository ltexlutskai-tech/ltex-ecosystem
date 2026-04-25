import React from "react";
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

const BRAND_COLOR = "#16a34a";

const QUICK_ACTIONS: {
  key: string;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  route: string;
  color: string;
}[] = [
  {
    key: "catalog",
    icon: "grid-outline",
    label: "Каталог",
    route: "Catalog",
    color: "#16a34a",
  },
  {
    key: "lots",
    icon: "cube-outline",
    label: "Лоти",
    route: "Lots",
    color: "#0284c7",
  },
  {
    key: "notifications",
    icon: "notifications-outline",
    label: "Сповіщення",
    route: "Notifications",
    color: "#dc2626",
  },
  {
    key: "wishlist",
    icon: "heart-outline",
    label: "Обране",
    route: "Wishlist",
    color: "#db2777",
  },
];

export function HomeScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<any>>();
  const [searchQuery, setSearchQuery] = React.useState("");

  const submitSearch = () => {
    const q = searchQuery.trim();
    if (!q) return;
    navigation.getParent()?.navigate("SearchTab", {
      screen: "SearchMain",
      params: { q },
    });
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.banner}>
        <Text style={styles.bannerTitle}>L-TEX</Text>
        <Text style={styles.bannerSubtitle}>
          Секонд хенд, сток, іграшки гуртом від 10 кг
        </Text>
      </View>

      <View style={styles.searchWrap}>
        <Ionicons name="search-outline" size={20} color="#9ca3af" />
        <TextInput
          style={styles.searchInput}
          placeholder="Пошук товарів..."
          placeholderTextColor="#9ca3af"
          value={searchQuery}
          onChangeText={setSearchQuery}
          returnKeyType="search"
          onSubmitEditing={submitSearch}
        />
      </View>

      <View style={styles.actionsRow}>
        {QUICK_ACTIONS.map((action) => (
          <TouchableOpacity
            key={action.key}
            style={styles.actionButton}
            onPress={() => navigation.navigate(action.route)}
            accessibilityLabel={action.label}
          >
            <View
              style={[
                styles.actionIconWrap,
                { backgroundColor: `${action.color}15` },
              ]}
            >
              <Ionicons name={action.icon} size={28} color={action.color} />
            </View>
            <Text style={styles.actionLabel} numberOfLines={1}>
              {action.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Рекомендації для вас</Text>
        <View style={styles.emptyRecsPlaceholder}>
          <Ionicons name="sparkles-outline" size={32} color="#d1d5db" />
          <Text style={styles.emptyRecsText}>
            Перегляньте товари у каталозі — ми покажемо схожі тут
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f9fafb" },
  content: { paddingBottom: 96 },
  banner: {
    margin: 16,
    padding: 24,
    borderRadius: 16,
    backgroundColor: BRAND_COLOR,
    alignItems: "center",
  },
  bannerTitle: {
    fontSize: 32,
    fontWeight: "bold",
    color: "#fff",
    letterSpacing: 2,
  },
  bannerSubtitle: {
    fontSize: 14,
    color: "rgba(255,255,255,0.9)",
    marginTop: 8,
    textAlign: "center",
  },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: "#111827",
  },
  actionsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    marginTop: 20,
  },
  actionButton: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: 4,
  },
  actionIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 6,
  },
  actionLabel: {
    fontSize: 12,
    color: "#374151",
    textAlign: "center",
  },
  section: { marginTop: 24, paddingHorizontal: 16 },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 12,
  },
  emptyRecsPlaceholder: {
    alignItems: "center",
    paddingVertical: 32,
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    gap: 8,
  },
  emptyRecsText: {
    fontSize: 13,
    color: "#9ca3af",
    textAlign: "center",
    paddingHorizontal: 24,
  },
});
