import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Linking,
} from "react-native";
import { useAuth } from "@/lib/auth";
import { shipmentsApi } from "@/lib/api";

interface Shipment {
  id: string;
  trackingNumber: string;
  carrier: string;
  status: string;
  statusText: string | null;
  estimatedDate: string | null;
  recipientCity: string | null;
  recipientBranch: string | null;
  order: { id: string; code1C: string | null; status: string; totalEur: number };
  createdAt: string;
}

const STATUS_COLORS: Record<string, string> = {
  created: "#f59e0b",
  in_transit: "#3b82f6",
  arrived: "#16a34a",
  delivered: "#16a34a",
  "1": "#f59e0b",
  "5": "#3b82f6",
  "7": "#3b82f6",
  "9": "#16a34a",
};

export function ShipmentsScreen() {
  const { customerId } = useAuth();
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!customerId) return;
    try {
      const data = await shipmentsApi.list(customerId) as { shipments: Shipment[] };
      setShipments(data.shipments);
    } catch {}
    setLoading(false);
  }, [customerId]);

  useEffect(() => { load(); }, [load]);

  async function handleTrack(trackingNumber: string) {
    try {
      const data = await shipmentsApi.track(trackingNumber) as { shipment: Shipment | null; novaPoshtaStatus: unknown };
      if (data.shipment) {
        Alert.alert(
          `ТТН: ${trackingNumber}`,
          `Статус: ${data.shipment.statusText ?? data.shipment.status}\n` +
          (data.shipment.estimatedDate
            ? `Очікувана дата: ${new Date(data.shipment.estimatedDate).toLocaleDateString("uk-UA")}\n`
            : "") +
          (data.shipment.recipientBranch ? `Відділення: ${data.shipment.recipientBranch}` : ""),
          [
            { text: "OK" },
            {
              text: "Відкрити на сайті",
              onPress: () => Linking.openURL(`https://novaposhta.ua/tracking/?cargo_number=${trackingNumber}`),
            },
          ],
        );
      }
      load(); // Refresh status
    } catch {
      Alert.alert("Помилка", "Не вдалось перевірити статус");
    }
  }

  function renderShipment({ item }: { item: Shipment }) {
    const statusColor = STATUS_COLORS[item.status] ?? "#666";

    return (
      <TouchableOpacity style={styles.card} onPress={() => handleTrack(item.trackingNumber)}>
        <View style={styles.cardHeader}>
          <Text style={styles.trackingNumber}>{item.trackingNumber}</Text>
          <View style={[styles.statusBadge, { backgroundColor: statusColor + "20" }]}>
            <Text style={[styles.statusText, { color: statusColor }]}>
              {item.statusText ?? item.status}
            </Text>
          </View>
        </View>

        <View style={styles.cardBody}>
          <Text style={styles.orderRef}>
            Замовлення: {item.order.code1C ?? item.order.id.slice(0, 8)}
          </Text>
          {item.recipientCity && (
            <Text style={styles.detail}>Місто: {item.recipientCity}</Text>
          )}
          {item.recipientBranch && (
            <Text style={styles.detail}>Відділення: {item.recipientBranch}</Text>
          )}
          {item.estimatedDate && (
            <Text style={styles.detail}>
              Очікувано: {new Date(item.estimatedDate).toLocaleDateString("uk-UA")}
            </Text>
          )}
        </View>

        <Text style={styles.trackHint}>Натисніть для оновлення статусу →</Text>
      </TouchableOpacity>
    );
  }

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color="#16a34a" /></View>;
  }

  return (
    <FlatList
      data={shipments}
      renderItem={renderShipment}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.list}
      ListEmptyComponent={
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>Немає відправлень</Text>
          <Text style={styles.emptyText}>Тут з'являться ваші посилки після відправки</Text>
        </View>
      }
      onRefresh={load}
      refreshing={loading}
    />
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  list: { padding: 12 },
  card: { backgroundColor: "#fff", borderRadius: 12, padding: 16, marginBottom: 12, elevation: 1, shadowColor: "#000", shadowOpacity: 0.05, shadowRadius: 4 },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  trackingNumber: { fontSize: 16, fontWeight: "bold", fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  statusText: { fontSize: 12, fontWeight: "600" },
  cardBody: { marginTop: 10 },
  orderRef: { fontSize: 13, color: "#666" },
  detail: { fontSize: 13, color: "#333", marginTop: 2 },
  trackHint: { fontSize: 12, color: "#16a34a", marginTop: 10, textAlign: "right" },
  empty: { alignItems: "center", paddingTop: 60 },
  emptyTitle: { fontSize: 18, fontWeight: "600" },
  emptyText: { fontSize: 14, color: "#999", marginTop: 4 },
});

// Platform import for font
import { Platform } from "react-native";
