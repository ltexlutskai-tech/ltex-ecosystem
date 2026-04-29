import React from "react";
import { TouchableOpacity, View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { useChatUnread } from "@/lib/chat-unread";

const BRAND_COLOR = "#16a34a";
const BADGE_COLOR = "#dc2626";

export function MessengerFab() {
  const navigation = useNavigation<any>();
  const { count } = useChatUnread();
  const badgeText = count > 0 ? (count > 9 ? "9+" : String(count)) : null;
  const a11yLabel =
    count > 0
      ? `Чат з менеджером, ${count} непрочитаних повідомлень`
      : "Чат з менеджером";

  return (
    <View pointerEvents="box-none" style={styles.container}>
      <TouchableOpacity
        style={styles.fab}
        onPress={() => navigation.navigate("MoreTab", { screen: "Chat" })}
        accessibilityLabel={a11yLabel}
        activeOpacity={0.85}
      >
        <Ionicons name="chatbubbles" size={28} color="#fff" />
        {badgeText && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{badgeText}</Text>
          </View>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    left: 0,
    right: 0,
    // Tab bar height — 56, FAB має half-overlap верхнього краю.
    // bottom = tabBarHeight (56) - FAB.height/2 (32) = 24.
    bottom: 24,
    alignItems: "center",
  },
  fab: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: BRAND_COLOR,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 10,
    borderWidth: 3,
    borderColor: "#fff",
  },
  badge: {
    position: "absolute",
    top: 0,
    right: 0,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 4,
    borderRadius: 10,
    backgroundColor: BADGE_COLOR,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#fff",
  },
  badgeText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "700",
  },
});
