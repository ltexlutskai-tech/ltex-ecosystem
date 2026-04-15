import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
  RefreshControl,
  TouchableOpacity,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/lib/auth";
import { ordersApi, shipmentsApi, paymentsApi } from "@/lib/api";

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

const STATUS_TIMELINE = [
  "pending",
  "confirmed",
  "processing",
  "shipped",
  "delivered",
  "completed",
] as const;

interface OrderItem {
  id: string;
  productName: string;
  barcode: string;
  weight: number;
  quantity: number;
  priceEur: number;
}

interface ShipmentInfo {
  id: string;
  trackingNumber: string;
  carrier: string;
  status: string;
  estimatedDelivery: string | null;
  shippedAt: string | null;
}

interface PaymentInfo {
  id: string;
  amount: number;
  currency: string;
  method: string;
  status: string;
  paidAt: string;
}

interface OrderDetail {
  id: string;
  code1C: string | null;
  status: string;
  totalEur: number;
  exchangeRate: number | null;
  contactName: string;
  contactPhone: string;
  notes: string | null;
  items: OrderItem[];
  createdAt: string;
  updatedAt: string;
}

interface OrderDetailScreenProps {
  route: {
    params: {
      orderId: string;
      orderCode: string;
    };
  };
  navigation: {
    navigate: (screen: string, params?: Record<string, unknown>) => void;
    setOptions: (opts: Record<string, unknown>) => void;
  };
}

export function OrderDetailScreen({
  route,
  navigation,
}: OrderDetailScreenProps) {
  const { orderId, orderCode } = route.params;
  const { customerId } = useAuth();

  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [shipments, setShipments] = useState<ShipmentInfo[]>([]);
  const [payments, setPayments] = useState<PaymentInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    navigation.setOptions({ title: orderCode });
  }, [navigation, orderCode]);

  const fetchData = useCallback(async () => {
    if (!customerId) return;
    try {
      const [orderData, paymentsData] = await Promise.all([
        ordersApi.detail(orderId) as Promise<{
          order: OrderDetail;
        }>,
        paymentsApi.forOrder(orderId) as Promise<{ payments: PaymentInfo[] }>,
      ]);
      setOrder(orderData.order);
      setPayments(paymentsData.payments ?? []);

      // Try to load shipment info if order has been shipped
      if (
        orderData.order.status === "shipped" ||
        orderData.order.status === "delivered"
      ) {
        try {
          const shipData = (await shipmentsApi.list()) as {
            shipments: ShipmentInfo[];
          };
          // Filter shipments for this order
          setShipments(
            (shipData.shipments ?? []).filter(
              (s: ShipmentInfo) =>
                // Shipments might be associated by orderId or other means
                s.id != null,
            ),
          );
        } catch {
          // Shipment data is optional
        }
      }
    } catch {
      Alert.alert("Помилка", "Не вдалось завантажити замовлення");
    }
  }, [customerId, orderId]);

  useEffect(() => {
    fetchData().finally(() => setLoading(false));
  }, [fetchData]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  }, [fetchData]);

  const formatDate = (dateStr: string): string => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("uk-UA", {
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatShortDate = (dateStr: string): string => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("uk-UA", {
      day: "numeric",
      month: "short",
    });
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#16a34a" />
      </View>
    );
  }

  if (!order) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Замовлення не знайдено</Text>
      </View>
    );
  }

  const totalPaid = payments.reduce((sum, p) => {
    if (p.status === "completed" || p.status === "confirmed") {
      return sum + p.amount;
    }
    return sum;
  }, 0);
  const remainingBalance = order.totalEur - totalPaid;
  const currentStatusIndex = STATUS_TIMELINE.indexOf(
    order.status as (typeof STATUS_TIMELINE)[number],
  );
  const isCancelled = order.status === "cancelled";
  const totalWeight = order.items.reduce((sum, item) => sum + item.weight, 0);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={handleRefresh}
          tintColor="#16a34a"
          colors={["#16a34a"]}
        />
      }
    >
      {/* Status timeline */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Статус замовлення</Text>
        {isCancelled ? (
          <View style={styles.cancelledBanner}>
            <Ionicons name="close-circle" size={24} color="#dc2626" />
            <Text style={styles.cancelledText}>Замовлення скасовано</Text>
          </View>
        ) : (
          <View style={styles.timeline}>
            {STATUS_TIMELINE.map((status, index) => {
              const isCompleted = index <= currentStatusIndex;
              const isCurrent = index === currentStatusIndex;
              const label = ORDER_STATUS_LABELS[status] ?? status;
              const color = isCompleted
                ? (ORDER_STATUS_COLORS[status] ?? "#16a34a")
                : "#d1d5db";

              return (
                <View key={status} style={styles.timelineItem}>
                  <View style={styles.timelineDotContainer}>
                    <View
                      style={[
                        styles.timelineDot,
                        { backgroundColor: color },
                        isCurrent && styles.timelineDotCurrent,
                      ]}
                    >
                      {isCompleted && (
                        <Ionicons name="checkmark" size={10} color="#fff" />
                      )}
                    </View>
                    {index < STATUS_TIMELINE.length - 1 && (
                      <View
                        style={[
                          styles.timelineLine,
                          {
                            backgroundColor:
                              index < currentStatusIndex
                                ? "#16a34a"
                                : "#e5e7eb",
                          },
                        ]}
                      />
                    )}
                  </View>
                  <Text
                    style={[
                      styles.timelineLabel,
                      isCompleted && styles.timelineLabelCompleted,
                      isCurrent && styles.timelineLabelCurrent,
                    ]}
                  >
                    {label}
                  </Text>
                </View>
              );
            })}
          </View>
        )}
      </View>

      {/* Order summary */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Деталі замовлення</Text>
        <View style={styles.infoCard}>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Номер</Text>
            <Text style={styles.infoValue}>
              {order.code1C ?? `#${order.id.slice(0, 8)}`}
            </Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Дата</Text>
            <Text style={styles.infoValue}>{formatDate(order.createdAt)}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Контакт</Text>
            <Text style={styles.infoValue}>{order.contactName}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Телефон</Text>
            <Text style={styles.infoValue}>{order.contactPhone}</Text>
          </View>
          {order.exchangeRate && (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Курс EUR/UAH</Text>
              <Text style={styles.infoValue}>
                {order.exchangeRate.toFixed(2)}
              </Text>
            </View>
          )}
          {order.notes && (
            <View style={styles.notesRow}>
              <Text style={styles.infoLabel}>Примітки</Text>
              <Text style={styles.notesText}>{order.notes}</Text>
            </View>
          )}
        </View>
      </View>

      {/* Order items */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>
          Товари ({order.items.length} позицій, {totalWeight.toFixed(1)} кг)
        </Text>
        {order.items.map((item) => (
          <View key={item.id} style={styles.orderItemCard}>
            <View style={styles.orderItemInfo}>
              <Text style={styles.orderItemName} numberOfLines={2}>
                {item.productName}
              </Text>
              <Text style={styles.orderItemBarcode}>{item.barcode}</Text>
            </View>
            <View style={styles.orderItemRight}>
              <Text style={styles.orderItemPrice}>
                {item.priceEur.toFixed(2)} EUR
              </Text>
              <Text style={styles.orderItemWeight}>{item.weight} кг</Text>
            </View>
          </View>
        ))}

        {/* Totals */}
        <View style={styles.totalsCard}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Сума замовлення</Text>
            <Text style={styles.totalValue}>
              {order.totalEur.toFixed(2)} EUR
            </Text>
          </View>
          {order.exchangeRate && (
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>В гривнях</Text>
              <Text style={styles.totalValueSecondary}>
                {(order.totalEur * order.exchangeRate).toFixed(2)} UAH
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* Shipments */}
      {shipments.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Доставка</Text>
          {shipments.map((shipment) => (
            <TouchableOpacity
              key={shipment.id}
              style={styles.shipmentCard}
              onPress={() =>
                navigation.navigate("ShipmentsTab", {
                  trackingNumber: shipment.trackingNumber,
                })
              }
            >
              <View style={styles.shipmentHeader}>
                <Ionicons name="car-outline" size={20} color="#0284c7" />
                <Text style={styles.shipmentCarrier}>{shipment.carrier}</Text>
              </View>
              <Text style={styles.shipmentTracking}>
                {shipment.trackingNumber}
              </Text>
              <Text style={styles.shipmentStatus}>{shipment.status}</Text>
              {shipment.estimatedDelivery && (
                <Text style={styles.shipmentEta}>
                  Орієнтовна доставка:{" "}
                  {formatShortDate(shipment.estimatedDelivery)}
                </Text>
              )}
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Payments */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Оплата</Text>
        {payments.length > 0 ? (
          <>
            {payments.map((payment) => (
              <View key={payment.id} style={styles.paymentCard}>
                <View style={styles.paymentLeft}>
                  <Ionicons
                    name={
                      payment.status === "completed" ||
                      payment.status === "confirmed"
                        ? "checkmark-circle"
                        : "time"
                    }
                    size={20}
                    color={
                      payment.status === "completed" ||
                      payment.status === "confirmed"
                        ? "#16a34a"
                        : "#d97706"
                    }
                  />
                  <View>
                    <Text style={styles.paymentMethod}>{payment.method}</Text>
                    <Text style={styles.paymentDate}>
                      {formatShortDate(payment.paidAt)}
                    </Text>
                  </View>
                </View>
                <Text style={styles.paymentAmount}>
                  {payment.amount.toFixed(2)} {payment.currency}
                </Text>
              </View>
            ))}

            {/* Balance */}
            <View style={styles.balanceCard}>
              <View style={styles.balanceRow}>
                <Text style={styles.balanceLabel}>Сплачено</Text>
                <Text style={styles.balancePaid}>
                  {totalPaid.toFixed(2)} EUR
                </Text>
              </View>
              <View style={styles.balanceRow}>
                <Text style={styles.balanceLabel}>Залишок</Text>
                <Text
                  style={[
                    styles.balanceRemaining,
                    remainingBalance <= 0 && styles.balancePaidFull,
                  ]}
                >
                  {remainingBalance > 0
                    ? `${remainingBalance.toFixed(2)} EUR`
                    : "Оплачено повністю"}
                </Text>
              </View>
            </View>
          </>
        ) : (
          <View style={styles.noPayments}>
            <Ionicons name="wallet-outline" size={24} color="#d1d5db" />
            <Text style={styles.noPaymentsText}>Оплат ще не було</Text>
            <Text style={styles.noPaymentsHint}>
              Зв'яжіться з менеджером для оплати
            </Text>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f9fafb",
  },
  content: {
    paddingBottom: 40,
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  errorText: {
    fontSize: 16,
    color: "#6b7280",
  },

  // Sections
  section: {
    paddingHorizontal: 16,
    paddingTop: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1f2937",
    marginBottom: 12,
  },

  // Timeline
  timeline: {
    paddingLeft: 4,
  },
  timelineItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  timelineDotContainer: {
    alignItems: "center",
    width: 20,
  },
  timelineDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  timelineDotCurrent: {
    borderWidth: 3,
    borderColor: "#bbf7d0",
  },
  timelineLine: {
    width: 2,
    height: 20,
    marginVertical: 2,
  },
  timelineLabel: {
    fontSize: 13,
    color: "#9ca3af",
    paddingTop: 2,
  },
  timelineLabelCompleted: {
    color: "#4b5563",
  },
  timelineLabelCurrent: {
    fontWeight: "700",
    color: "#1f2937",
  },

  cancelledBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#fef2f2",
    borderRadius: 10,
    padding: 14,
  },
  cancelledText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#dc2626",
  },

  // Info card
  infoCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 14,
    gap: 8,
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  infoLabel: {
    fontSize: 13,
    color: "#6b7280",
  },
  infoValue: {
    fontSize: 13,
    fontWeight: "600",
    color: "#1f2937",
  },
  notesRow: {
    gap: 4,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: "#f3f4f6",
  },
  notesText: {
    fontSize: 13,
    color: "#4b5563",
    lineHeight: 18,
  },

  // Order items
  orderItemCard: {
    flexDirection: "row",
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 12,
    marginBottom: 6,
    alignItems: "center",
  },
  orderItemInfo: {
    flex: 1,
    gap: 2,
  },
  orderItemName: {
    fontSize: 13,
    fontWeight: "600",
    color: "#1f2937",
    lineHeight: 18,
  },
  orderItemBarcode: {
    fontSize: 11,
    color: "#9ca3af",
  },
  orderItemRight: {
    alignItems: "flex-end",
    gap: 2,
    marginLeft: 8,
  },
  orderItemPrice: {
    fontSize: 14,
    fontWeight: "700",
    color: "#16a34a",
  },
  orderItemWeight: {
    fontSize: 12,
    color: "#6b7280",
  },

  // Totals
  totalsCard: {
    backgroundColor: "#f0fdf4",
    borderRadius: 10,
    padding: 14,
    marginTop: 6,
    gap: 6,
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  totalLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
  },
  totalValue: {
    fontSize: 18,
    fontWeight: "700",
    color: "#16a34a",
  },
  totalValueSecondary: {
    fontSize: 14,
    fontWeight: "600",
    color: "#6b7280",
  },

  // Shipments
  shipmentCard: {
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
    gap: 4,
  },
  shipmentHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  shipmentCarrier: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1f2937",
  },
  shipmentTracking: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0284c7",
    marginLeft: 28,
  },
  shipmentStatus: {
    fontSize: 13,
    color: "#6b7280",
    marginLeft: 28,
  },
  shipmentEta: {
    fontSize: 12,
    color: "#9ca3af",
    marginLeft: 28,
  },

  // Payments
  paymentCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 12,
    marginBottom: 6,
  },
  paymentLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  paymentMethod: {
    fontSize: 13,
    fontWeight: "600",
    color: "#1f2937",
  },
  paymentDate: {
    fontSize: 12,
    color: "#9ca3af",
  },
  paymentAmount: {
    fontSize: 14,
    fontWeight: "700",
    color: "#1f2937",
  },

  // Balance
  balanceCard: {
    backgroundColor: "#f9fafb",
    borderRadius: 10,
    padding: 14,
    marginTop: 6,
    gap: 6,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  balanceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  balanceLabel: {
    fontSize: 13,
    color: "#6b7280",
  },
  balancePaid: {
    fontSize: 14,
    fontWeight: "600",
    color: "#16a34a",
  },
  balanceRemaining: {
    fontSize: 15,
    fontWeight: "700",
    color: "#d97706",
  },
  balancePaidFull: {
    color: "#16a34a",
  },

  noPayments: {
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 24,
    gap: 6,
  },
  noPaymentsText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#6b7280",
  },
  noPaymentsHint: {
    fontSize: 12,
    color: "#9ca3af",
  },
});
