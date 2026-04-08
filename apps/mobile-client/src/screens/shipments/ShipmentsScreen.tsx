import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Linking,
  RefreshControl,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/lib/auth";
import { shipmentsApi } from "@/lib/api";
import { ShipmentsSkeleton } from "@/components/SkeletonLoader";

interface Shipment {
  id: string;
  trackingNumber: string;
  carrier: string;
  status: string;
  statusText: string | null;
  estimatedDate: string | null;
  recipientCity: string | null;
  recipientBranch: string | null;
  order: {
    id: string;
    code1C: string | null;
    status: string;
    totalEur: number;
  };
  createdAt: string;
}

const STATUS_LABELS: Record<string, string> = {
  created: "Створено",
  in_transit: "В дорозі",
  arrived: "Прибула",
  delivered: "Доставлено",
  returned: "Повернення",
};

const STATUS_COLORS: Record<string, string> = {
  created: "#d97706",
  in_transit: "#2563eb",
  arrived: "#16a34a",
  delivered: "#16a34a",
  returned: "#dc2626",
};

const STATUS_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  created: "document-outline",
  in_transit: "car-outline",
  arrived: "location-outline",
  delivered: "checkmark-circle-outline",
  returned: "return-up-back-outline",
};

interface ShipmentsScreenProps {
  navigation?: {
    navigate: (screen: string, params?: Record<string, unknown>) => void;
  };
}

export function ShipmentsScreen(_props: ShipmentsScreenProps) {
  const { customerId } = useAuth();
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [trackingLoading, setTrackingLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchShipments = useCallback(async () => {
    if (!customerId) return;
    try {
      setError(null);
      const data = (await shipmentsApi.list(customerId)) as {
        shipments: Shipment[];
      };
      setShipments(data.shipments ?? []);
    } catch {
      setError("Не вдалося завантажити відправлення");
    }
  }, [customerId]);

  useEffect(() => {
    fetchShipments().finally(() => setLoading(false));
  }, [fetchShipments]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchShipments();
    setRefreshing(false);
  }, [fetchShipments]);

  const handleTrack = useCallback(
    async (shipment: Shipment) => {
      setTrackingLoading(shipment.id);
      try {
        const data = (await shipmentsApi.track(shipment.trackingNumber)) as {
          shipment: Shipment | null;
          novaPoshtaStatus: unknown;
        };

        const tracked = data.shipment;
        if (tracked) {
          const statusLabel =
            tracked.statusText ??
            STATUS_LABELS[tracked.status] ??
            tracked.status;

          const details = [
            `Статус: ${statusLabel}`,
            tracked.estimatedDate
              ? `Очікувана доставка: ${formatDate(tracked.estimatedDate)}`
              : null,
            tracked.recipientCity ? `Місто: ${tracked.recipientCity}` : null,
            tracked.recipientBranch
              ? `Відділення: ${tracked.recipientBranch}`
              : null,
          ]
            .filter(Boolean)
            .join("\n");

          Alert.alert(`ТТН: ${shipment.trackingNumber}`, details, [
            { text: "OK" },
            {
              text: "Відкрити Нова Пошта",
              onPress: () =>
                Linking.openURL(
                  `https://novaposhta.ua/tracking/?cargo_number=${shipment.trackingNumber}`,
                ).catch(() =>
                  Alert.alert("Помилка", "Не вдалось відкрити посилання"),
                ),
            },
          ]);
        } else {
          Alert.alert("Інформація", "Дані відстеження недоступні", [
            { text: "OK" },
            {
              text: "Відкрити Нова Пошта",
              onPress: () =>
                Linking.openURL(
                  `https://novaposhta.ua/tracking/?cargo_number=${shipment.trackingNumber}`,
                ).catch(() => {}),
            },
          ]);
        }

        // Refresh list to get updated statuses
        fetchShipments();
      } catch {
        Alert.alert("Помилка", "Не вдалось перевірити статус відправлення");
      } finally {
        setTrackingLoading(null);
      }
    },
    [fetchShipments],
  );

  const openNovaPoshtaTracking = useCallback((trackingNumber: string) => {
    Linking.openURL(
      `https://novaposhta.ua/tracking/?cargo_number=${trackingNumber}`,
    ).catch(() => Alert.alert("Помилка", "Не вдалось відкрити посилання"));
  }, []);

  const formatDate = (dateStr: string): string => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("uk-UA", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  };

  const formatShortDate = (dateStr: string): string => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("uk-UA", {
      day: "numeric",
      month: "short",
    });
  };

  const renderShipment = useCallback(
    ({ item }: { item: Shipment }) => {
      const statusColor = STATUS_COLORS[item.status] ?? "#6b7280";
      const statusLabel =
        item.statusText ?? STATUS_LABELS[item.status] ?? item.status;
      const statusIcon = STATUS_ICONS[item.status] ?? "ellipse-outline";
      const isTracking = trackingLoading === item.id;

      return (
        <View style={styles.shipmentCard}>
          {/* Header: tracking number + status */}
          <View style={styles.cardHeader}>
            <View style={styles.carrierRow}>
              <Ionicons name="car-outline" size={18} color="#6b7280" />
              <Text style={styles.carrierText}>{item.carrier}</Text>
            </View>
            <View
              style={[
                styles.statusBadge,
                { backgroundColor: statusColor + "1a" },
              ]}
            >
              <Ionicons name={statusIcon} size={12} color={statusColor} />
              <Text style={[styles.statusText, { color: statusColor }]}>
                {statusLabel}
              </Text>
            </View>
          </View>

          {/* Tracking number */}
          <Text style={styles.trackingNumber}>{item.trackingNumber}</Text>

          {/* Details */}
          <View style={styles.cardDetails}>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Замовлення:</Text>
              <Text style={styles.detailValue}>
                {item.order.code1C ?? `#${item.order.id.slice(0, 8)}`}
              </Text>
            </View>
            {item.recipientCity && (
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Місто:</Text>
                <Text style={styles.detailValue}>{item.recipientCity}</Text>
              </View>
            )}
            {item.recipientBranch && (
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Відділення:</Text>
                <Text style={styles.detailValue}>{item.recipientBranch}</Text>
              </View>
            )}
            {item.estimatedDate && (
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Очікувана доставка:</Text>
                <Text style={styles.detailValueHighlight}>
                  {formatShortDate(item.estimatedDate)}
                </Text>
              </View>
            )}
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Сума замовлення:</Text>
              <Text style={styles.detailValue}>
                {item.order.totalEur.toFixed(2)} EUR
              </Text>
            </View>
          </View>

          {/* Actions */}
          <View style={styles.cardActions}>
            <TouchableOpacity
              style={styles.trackButton}
              onPress={() => handleTrack(item)}
              disabled={isTracking}
            >
              {isTracking ? (
                <ActivityIndicator size="small" color="#16a34a" />
              ) : (
                <>
                  <Ionicons name="refresh-outline" size={16} color="#16a34a" />
                  <Text style={styles.trackButtonText}>Оновити статус</Text>
                </>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.novaPoshtaButton}
              onPress={() => openNovaPoshtaTracking(item.trackingNumber)}
            >
              <Ionicons name="open-outline" size={16} color="#0284c7" />
              <Text style={styles.novaPoshtaButtonText}>Нова Пошта</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    },
    [trackingLoading, handleTrack, openNovaPoshtaTracking],
  );

  if (!customerId) {
    return (
      <View style={styles.centered}>
        <Ionicons name="car-outline" size={48} color="#d1d5db" />
        <Text style={styles.emptyTitle}>
          Увійдіть для перегляду відправлень
        </Text>
      </View>
    );
  }

  if (loading) {
    return <ShipmentsSkeleton />;
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={shipments}
        keyExtractor={(item) => item.id}
        renderItem={renderShipment}
        contentContainerStyle={
          shipments.length === 0 ? styles.emptyList : styles.listContent
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
              name={error ? "alert-circle-outline" : "cube-outline"}
              size={48}
              color={error ? "#dc2626" : "#d1d5db"}
            />
            <Text style={styles.emptyTitle}>
              {error ?? "Немає відправлень"}
            </Text>
            {!error && (
              <Text style={styles.emptyHint}>
                Тут з'являться ваші посилки після відправки замовлень
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
    textAlign: "center",
    marginTop: 4,
    lineHeight: 18,
  },

  // Shipment card
  shipmentCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    elevation: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  carrierRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  carrierText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#6b7280",
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusText: {
    fontSize: 12,
    fontWeight: "600",
  },

  trackingNumber: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1f2937",
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    letterSpacing: 0.5,
    marginBottom: 10,
  },

  // Details
  cardDetails: {
    gap: 4,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#f3f4f6",
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  detailLabel: {
    fontSize: 13,
    color: "#6b7280",
  },
  detailValue: {
    fontSize: 13,
    fontWeight: "500",
    color: "#1f2937",
  },
  detailValueHighlight: {
    fontSize: 13,
    fontWeight: "600",
    color: "#16a34a",
  },

  // Actions
  cardActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#f3f4f6",
  },
  trackButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    backgroundColor: "#f0fdf4",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#bbf7d0",
  },
  trackButtonText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#16a34a",
  },
  novaPoshtaButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    backgroundColor: "#eff6ff",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#bfdbfe",
  },
  novaPoshtaButtonText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#0284c7",
  },
});
