import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/lib/auth";
import { ordersApi } from "@/lib/api";
import { OrdersSkeleton } from "@/components/SkeletonLoader";

const ORDER_STATUS_LABELS: Record<string, string> = {
  pending: "Очікує",
  confirmed: "Підтверджено",
  processing: "В обробці",
  shipped: "Відправлено",
  delivered: "Доставлено",
  cancelled: "Скасовано",
  completed: "Завершено",
};

const ORDER_STATUS_COLORS: Record<string, string> = {
  pending: "#d97706",
  confirmed: "#2563eb",
  processing: "#7c3aed",
  shipped: "#0284c7",
  delivered: "#16a34a",
  cancelled: "#dc2626",
  completed: "#16a34a",
};

const ORDER_STATUS_ICONS: Record<string, string> = {
  pending: "time-outline",
  confirmed: "checkmark-circle-outline",
  processing: "construct-outline",
  shipped: "car-outline",
  delivered: "checkmark-done-outline",
  cancelled: "close-circle-outline",
  completed: "checkmark-done-circle-outline",
};

interface OrderSummary {
  id: string;
  code1C: string | null;
  status: string;
  totalEur: number;
  itemsCount: number;
  totalWeight: number;
  createdAt: string;
  contactName: string;
}

interface OrdersScreenProps {
  navigation: {
    navigate: (screen: string, params?: Record<string, unknown>) => void;
  };
}

export function OrdersScreen({ navigation }: OrdersScreenProps) {
  const { customerId } = useAuth();
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchOrders = useCallback(async () => {
    if (!customerId) return;
    try {
      setError(null);
      const data = (await ordersApi.list(customerId)) as {
        orders: OrderSummary[];
      };
      setOrders(data.orders ?? []);
    } catch {
      setError("Не вдалося завантажити замовлення");
    }
  }, [customerId]);

  useEffect(() => {
    fetchOrders().finally(() => setLoading(false));
  }, [fetchOrders]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchOrders();
    setRefreshing(false);
  }, [fetchOrders]);

  const handleOrderPress = useCallback(
    (order: OrderSummary) => {
      navigation.navigate("OrderDetail", {
        orderId: order.id,
        orderCode: order.code1C ?? `#${order.id.slice(0, 8)}`,
      });
    },
    [navigation],
  );

  const formatDate = (dateStr: string): string => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("uk-UA", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  };

  const renderOrder = useCallback(
    ({ item }: { item: OrderSummary }) => {
      const statusLabel = ORDER_STATUS_LABELS[item.status] ?? item.status;
      const statusColor = ORDER_STATUS_COLORS[item.status] ?? "#6b7280";
      const statusIcon = ORDER_STATUS_ICONS[item.status] ?? "ellipse-outline";

      return (
        <TouchableOpacity
          style={styles.orderCard}
          onPress={() => handleOrderPress(item)}
          activeOpacity={0.7}
        >
          <View style={styles.orderHeader}>
            <View style={styles.orderCodeRow}>
              <Text style={styles.orderCode}>
                {item.code1C ?? `#${item.id.slice(0, 8)}`}
              </Text>
              <Text style={styles.orderDate}>{formatDate(item.createdAt)}</Text>
            </View>
            <View
              style={[
                styles.statusBadge,
                { backgroundColor: statusColor + "1a" },
              ]}
            >
              <Ionicons
                name={statusIcon as keyof typeof Ionicons.glyphMap}
                size={14}
                color={statusColor}
              />
              <Text style={[styles.statusText, { color: statusColor }]}>
                {statusLabel}
              </Text>
            </View>
          </View>

          <View style={styles.orderDetails}>
            <View style={styles.detailItem}>
              <Text style={styles.detailLabel}>Сума</Text>
              <Text style={styles.detailValue}>
                {item.totalEur.toFixed(2)} EUR
              </Text>
            </View>
            <View style={styles.detailItem}>
              <Text style={styles.detailLabel}>Мішків</Text>
              <Text style={styles.detailValue}>{item.itemsCount}</Text>
            </View>
            <View style={styles.detailItem}>
              <Text style={styles.detailLabel}>Вага</Text>
              <Text style={styles.detailValue}>
                {item.totalWeight.toFixed(1)} кг
              </Text>
            </View>
          </View>

          <View style={styles.orderFooter}>
            <Text style={styles.viewDetails}>Детальніше</Text>
            <Ionicons name="chevron-forward" size={16} color="#16a34a" />
          </View>
        </TouchableOpacity>
      );
    },
    [handleOrderPress],
  );

  if (!customerId) {
    return (
      <View style={styles.centered}>
        <Ionicons name="log-in-outline" size={48} color="#d1d5db" />
        <Text style={styles.emptyTitle}>Увійдіть для перегляду замовлень</Text>
      </View>
    );
  }

  if (loading) {
    return <OrdersSkeleton />;
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={orders}
        keyExtractor={(item) => item.id}
        renderItem={renderOrder}
        contentContainerStyle={
          orders.length === 0 ? styles.emptyList : styles.listContent
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor="#16a34a"
            colors={["#16a34a"]}
          />
        }
        ListEmptyComponent={
          <View style={styles.centered}>
            <Ionicons
              name={error ? "alert-circle-outline" : "receipt-outline"}
              size={48}
              color={error ? "#dc2626" : "#d1d5db"}
            />
            <Text style={styles.emptyTitle}>
              {error ?? "Замовлень поки немає"}
            </Text>
            {!error && (
              <Text style={styles.emptyHint}>
                Оформіть перше замовлення з каталогу
              </Text>
            )}
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f9fafb",
  },
  listContent: {
    padding: 16,
    paddingBottom: 24,
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: "#6b7280",
  },
  emptyList: {
    flexGrow: 1,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#4b5563",
    marginTop: 16,
  },
  emptyHint: {
    fontSize: 13,
    color: "#9ca3af",
    marginTop: 4,
  },

  // Order card
  orderCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    elevation: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  orderHeader: {
    marginBottom: 12,
  },
  orderCodeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  orderCode: {
    fontSize: 15,
    fontWeight: "700",
    color: "#1f2937",
  },
  orderDate: {
    fontSize: 13,
    color: "#9ca3af",
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    alignSelf: "flex-start",
  },
  statusText: {
    fontSize: 12,
    fontWeight: "600",
  },

  orderDetails: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#f3f4f6",
  },
  detailItem: {
    alignItems: "center",
    gap: 2,
  },
  detailLabel: {
    fontSize: 11,
    color: "#9ca3af",
    textTransform: "uppercase",
  },
  detailValue: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1f2937",
  },

  orderFooter: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: 4,
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#f3f4f6",
  },
  viewDetails: {
    fontSize: 13,
    fontWeight: "600",
    color: "#16a34a",
  },
});
