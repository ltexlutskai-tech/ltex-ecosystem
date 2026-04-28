import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useState,
} from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import {
  notificationsApi,
  type NotificationFeedItem,
  type NotificationType,
} from "@/lib/api";

const BRAND_COLOR = "#16a34a";
const UNREAD_DOT_COLOR = "#2563eb";

type IconName = keyof typeof Ionicons.glyphMap;

const TYPE_ICONS: Record<NotificationType, IconName> = {
  order_status: "cube-outline",
  new_video: "play-circle-outline",
  chat_message: "chatbubble-outline",
  system: "notifications-outline",
};

function iconForType(type: string): IconName {
  return TYPE_ICONS[type as NotificationType] ?? "notifications-outline";
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

const MONTHS_UK = [
  "січ",
  "лют",
  "бер",
  "квіт",
  "трав",
  "черв",
  "лип",
  "серп",
  "вер",
  "жовт",
  "лист",
  "груд",
];

function formatRelative(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return "щойно";
  if (diffMin < 60) return `${diffMin} хв тому`;

  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  );
  const startOfYesterday = new Date(startOfToday);
  startOfYesterday.setDate(startOfToday.getDate() - 1);
  const time = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;

  if (d >= startOfToday) return `Сьогодні ${time}`;
  if (d >= startOfYesterday) return `Вчора ${time}`;
  return `${d.getDate()} ${MONTHS_UK[d.getMonth()]}`;
}

function getPayloadString(
  payload: Record<string, unknown> | null,
  key: string,
): string | undefined {
  if (!payload) return undefined;
  const value = payload[key];
  return typeof value === "string" ? value : undefined;
}

export function NotificationsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<any>>();
  const [items, setItems] = useState<NotificationFeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await notificationsApi.list();
      setItems(data.notifications ?? []);
    } catch {
      // Ignore — show what we have
    }
  }, []);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const markAllRead = useCallback(() => {
    setItems((prev) =>
      prev.map((n) =>
        n.readAt ? n : { ...n, readAt: new Date().toISOString() },
      ),
    );
    notificationsApi.markAsRead().catch(() => {});
  }, []);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity
          onPress={markAllRead}
          accessibilityLabel="Позначити всі як прочитані"
          style={styles.headerIconButton}
        >
          <Ionicons name="checkmark-done" size={22} color={BRAND_COLOR} />
        </TouchableOpacity>
      ),
    });
  }, [navigation, markAllRead]);

  const handlePress = useCallback(
    (item: NotificationFeedItem) => {
      if (!item.readAt) {
        setItems((prev) =>
          prev.map((n) =>
            n.id === item.id ? { ...n, readAt: new Date().toISOString() } : n,
          ),
        );
        notificationsApi.markAsRead(item.id).catch(() => {});
      }

      const parent = navigation.getParent();

      if (item.type === "order_status") {
        const orderId = getPayloadString(item.payload, "orderId");
        if (orderId && parent) {
          parent.navigate("MoreTab", {
            screen: "OrderDetail",
            params: {
              orderId,
              orderCode: getPayloadString(item.payload, "orderCode") ?? orderId,
            },
          });
        }
        return;
      }

      if (item.type === "new_video") {
        const productId = getPayloadString(item.payload, "productId");
        const slug = getPayloadString(item.payload, "slug");
        const name = getPayloadString(item.payload, "name");
        if (productId && slug && name) {
          navigation.navigate("ProductDetail", { productId, slug, name });
        }
        return;
      }

      if (item.type === "chat_message" && parent) {
        parent.navigate("MoreTab", { screen: "Chat" });
        return;
      }
      // "system" — no navigation, just mark as read
    },
    [navigation],
  );

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={BRAND_COLOR} />
      </View>
    );
  }

  if (items.length === 0) {
    return (
      <View style={styles.centerContainer}>
        <Ionicons name="notifications-outline" size={48} color="#d1d5db" />
        <Text style={styles.emptyTitle}>Поки що сповіщень немає</Text>
        <Text style={styles.emptySubtitle}>
          Тут з&apos;являться оновлення про замовлення, нові товари та
          відеоогляди.
        </Text>
      </View>
    );
  }

  return (
    <FlatList
      data={items}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.listContent}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
      }
      renderItem={({ item }) => {
        const isUnread = !item.readAt;
        return (
          <TouchableOpacity
            onPress={() => handlePress(item)}
            style={[styles.row, isUnread && styles.rowUnread]}
            accessibilityRole="button"
            accessibilityState={{ selected: !isUnread }}
          >
            <View style={styles.dotColumn}>
              {isUnread ? <View style={styles.unreadDot} /> : null}
            </View>
            <View style={styles.iconWrap}>
              <Ionicons
                name={iconForType(item.type)}
                size={22}
                color={BRAND_COLOR}
              />
            </View>
            <View style={styles.content}>
              <Text style={styles.title} numberOfLines={1}>
                {item.title}
              </Text>
              {item.body ? (
                <Text style={styles.body} numberOfLines={2}>
                  {item.body}
                </Text>
              ) : null}
              <Text style={styles.time}>{formatRelative(item.createdAt)}</Text>
            </View>
          </TouchableOpacity>
        );
      }}
      ItemSeparatorComponent={() => <View style={styles.separator} />}
    />
  );
}

const styles = StyleSheet.create({
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
    backgroundColor: "#f9fafb",
    gap: 12,
  },
  emptyTitle: { fontSize: 18, fontWeight: "600", color: "#111827" },
  emptySubtitle: { fontSize: 14, color: "#6b7280", textAlign: "center" },
  listContent: { backgroundColor: "#f9fafb", paddingVertical: 8 },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#ffffff",
  },
  rowUnread: { backgroundColor: "#eff6ff" },
  dotColumn: {
    width: 16,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 8,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: UNREAD_DOT_COLOR,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#f0fdf4",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  content: { flex: 1, gap: 2 },
  title: { fontSize: 15, fontWeight: "600", color: "#111827" },
  body: { fontSize: 14, color: "#374151" },
  time: { fontSize: 12, color: "#6b7280", marginTop: 2 },
  separator: { height: 1, backgroundColor: "#e5e7eb" },
  headerIconButton: { padding: 8, marginRight: 4 },
});
