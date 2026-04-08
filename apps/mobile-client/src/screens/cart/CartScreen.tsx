import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/lib/auth";
import { ordersApi } from "@/lib/api";

export interface CartItem {
  lotId: string;
  productId: string;
  productName: string;
  barcode: string;
  weight: number;
  quantity: number;
  priceEur: number;
}

interface CartContextType {
  items: CartItem[];
  addItem: (item: CartItem) => void;
  removeItem: (lotId: string) => void;
  clearCart: () => void;
}

// This will be provided via context from App.tsx; for now we use a simple prop-based approach
interface CartScreenProps {
  navigation: {
    navigate: (screen: string, params?: Record<string, unknown>) => void;
  };
  cart: CartContextType;
}

export function CartScreen({ navigation, cart }: CartScreenProps) {
  const { customerId, customerName, phone } = useAuth();

  const [contactName, setContactName] = useState(customerName ?? "");
  const [contactPhone, setContactPhone] = useState(phone ?? "");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showCheckout, setShowCheckout] = useState(false);

  const totalWeight = cart.items.reduce((sum, item) => sum + item.weight, 0);
  const totalPrice = cart.items.reduce((sum, item) => sum + item.priceEur, 0);
  const minWeightMet = totalWeight >= 10;

  const handleRemoveItem = useCallback(
    (lotId: string) => {
      Alert.alert("Видалити", "Видалити мішок з кошика?", [
        { text: "Скасувати", style: "cancel" },
        {
          text: "Видалити",
          style: "destructive",
          onPress: () => cart.removeItem(lotId),
        },
      ]);
    },
    [cart],
  );

  const handleSubmitOrder = useCallback(async () => {
    if (!customerId) {
      Alert.alert("Помилка", "Необхідно увійти для оформлення замовлення");
      return;
    }
    if (!minWeightMet) {
      Alert.alert(
        "Мінімальне замовлення",
        `Мінімальне замовлення від 10 кг. Зараз у кошику: ${totalWeight.toFixed(1)} кг`,
      );
      return;
    }
    if (!contactName.trim()) {
      Alert.alert("Помилка", "Введіть ім'я");
      return;
    }
    if (!contactPhone.trim() || contactPhone.length < 10) {
      Alert.alert("Помилка", "Введіть коректний номер телефону");
      return;
    }

    setSubmitting(true);
    try {
      const orderItems = cart.items.map((item) => ({
        lotId: item.lotId,
        productId: item.productId,
        priceEur: item.priceEur,
        weight: item.weight,
      }));

      await ordersApi.list(customerId); // Verify customer exists
      // Submit order via the orders API
      const response = await fetch(
        `${process.env.EXPO_PUBLIC_API_URL ?? "https://ltex.com.ua/api"}/orders`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            customerId,
            contactName: contactName.trim(),
            contactPhone: contactPhone.trim(),
            notes: notes.trim() || undefined,
            items: orderItems,
          }),
        },
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error ?? "Помилка створення замовлення");
      }

      cart.clearCart();
      setShowCheckout(false);
      setNotes("");

      Alert.alert(
        "Замовлення створено!",
        `Загальна вага: ${totalWeight.toFixed(1)} кг\nСума: ${totalPrice.toFixed(2)} EUR\n\nМенеджер зв'яжеться з вами найближчим часом.`,
        [
          {
            text: "Мої замовлення",
            onPress: () => navigation.navigate("OrdersTab"),
          },
          { text: "OK" },
        ],
      );
    } catch (error) {
      Alert.alert(
        "Помилка",
        error instanceof Error
          ? error.message
          : "Не вдалось створити замовлення",
      );
    } finally {
      setSubmitting(false);
    }
  }, [
    customerId,
    minWeightMet,
    contactName,
    contactPhone,
    notes,
    cart,
    totalWeight,
    totalPrice,
    navigation,
  ]);

  const renderCartItem = useCallback(
    ({ item }: { item: CartItem }) => (
      <View style={styles.itemCard}>
        <View style={styles.itemInfo}>
          <Text style={styles.itemName} numberOfLines={1}>
            {item.productName}
          </Text>
          <Text style={styles.itemBarcode}>{item.barcode}</Text>
          <View style={styles.itemDetailsRow}>
            <Text style={styles.itemDetail}>{item.weight} кг</Text>
            <Text style={styles.itemSep}>·</Text>
            <Text style={styles.itemDetail}>{item.quantity} шт</Text>
            <Text style={styles.itemSep}>·</Text>
            <Text style={styles.itemPrice}>{item.priceEur.toFixed(2)} EUR</Text>
          </View>
        </View>
        <TouchableOpacity
          style={styles.removeButton}
          onPress={() => handleRemoveItem(item.lotId)}
        >
          <Ionicons name="trash-outline" size={20} color="#dc2626" />
        </TouchableOpacity>
      </View>
    ),
    [handleRemoveItem],
  );

  if (cart.items.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Ionicons name="cart-outline" size={64} color="#d1d5db" />
        <Text style={styles.emptyTitle}>Кошик порожній</Text>
        <Text style={styles.emptyHint}>
          Додайте мішки з каталогу для оформлення замовлення
        </Text>
        <TouchableOpacity
          style={styles.catalogButton}
          onPress={() => navigation.navigate("CatalogTab")}
        >
          <Text style={styles.catalogButtonText}>Перейти до каталогу</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <FlatList
        data={cart.items}
        keyExtractor={(item) => item.lotId}
        renderItem={renderCartItem}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View style={styles.summaryCard}>
            <Text style={styles.summaryTitle}>Кошик</Text>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Мішків:</Text>
              <Text style={styles.summaryValue}>{cart.items.length}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Загальна вага:</Text>
              <Text
                style={[
                  styles.summaryValue,
                  !minWeightMet && styles.summaryWarning,
                ]}
              >
                {totalWeight.toFixed(1)} кг
              </Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Сума:</Text>
              <Text style={styles.summaryValueBig}>
                {totalPrice.toFixed(2)} EUR
              </Text>
            </View>
            {!minWeightMet && (
              <View style={styles.warningBox}>
                <Ionicons name="warning-outline" size={16} color="#d97706" />
                <Text style={styles.warningText}>
                  Мінімальне замовлення від 10 кг. Потрібно ще{" "}
                  {(10 - totalWeight).toFixed(1)} кг
                </Text>
              </View>
            )}
          </View>
        }
        ListFooterComponent={
          showCheckout ? (
            <ScrollView style={styles.checkoutSection} scrollEnabled={false}>
              <Text style={styles.checkoutTitle}>Оформлення замовлення</Text>

              <Text style={styles.fieldLabel}>Ім'я / Компанія *</Text>
              <TextInput
                style={styles.input}
                value={contactName}
                onChangeText={setContactName}
                placeholder="ФОП Іваненко"
                autoComplete="name"
              />

              <Text style={styles.fieldLabel}>Телефон *</Text>
              <TextInput
                style={styles.input}
                value={contactPhone}
                onChangeText={setContactPhone}
                placeholder="+380..."
                keyboardType="phone-pad"
                autoComplete="tel"
              />

              <Text style={styles.fieldLabel}>Примітки</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={notes}
                onChangeText={setNotes}
                placeholder="Бажання щодо доставки, оплати тощо..."
                multiline
                numberOfLines={3}
                textAlignVertical="top"
              />

              <TouchableOpacity
                style={[
                  styles.submitButton,
                  (!minWeightMet || submitting) && styles.submitButtonDisabled,
                ]}
                onPress={handleSubmitOrder}
                disabled={!minWeightMet || submitting}
              >
                {submitting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.submitButtonText}>
                    Підтвердити замовлення
                  </Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.cancelCheckout}
                onPress={() => setShowCheckout(false)}
              >
                <Text style={styles.cancelCheckoutText}>Скасувати</Text>
              </TouchableOpacity>
            </ScrollView>
          ) : (
            <View style={styles.footerActions}>
              <TouchableOpacity
                style={[
                  styles.checkoutButton,
                  !minWeightMet && styles.checkoutButtonDisabled,
                ]}
                onPress={() => setShowCheckout(true)}
                disabled={!minWeightMet}
              >
                <Ionicons
                  name="checkmark-circle-outline"
                  size={20}
                  color="#fff"
                />
                <Text style={styles.checkoutButtonText}>
                  Оформити замовлення
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.clearButton}
                onPress={() =>
                  Alert.alert("Очистити кошик?", "Всі мішки будуть видалені", [
                    { text: "Скасувати", style: "cancel" },
                    {
                      text: "Очистити",
                      style: "destructive",
                      onPress: cart.clearCart,
                    },
                  ])
                }
              >
                <Text style={styles.clearButtonText}>Очистити кошик</Text>
              </TouchableOpacity>
            </View>
          )
        }
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f9fafb",
  },
  listContent: {
    padding: 16,
    paddingBottom: 40,
  },

  // Empty state
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
    backgroundColor: "#f9fafb",
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#4b5563",
    marginTop: 16,
  },
  emptyHint: {
    fontSize: 14,
    color: "#9ca3af",
    textAlign: "center",
    marginTop: 8,
    lineHeight: 20,
  },
  catalogButton: {
    marginTop: 24,
    backgroundColor: "#16a34a",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
  },
  catalogButtonText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
  },

  // Summary card
  summaryCard: {
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
  summaryTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1f2937",
    marginBottom: 12,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  summaryLabel: {
    fontSize: 14,
    color: "#6b7280",
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1f2937",
  },
  summaryValueBig: {
    fontSize: 18,
    fontWeight: "700",
    color: "#16a34a",
  },
  summaryWarning: {
    color: "#d97706",
  },
  warningBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#fffbeb",
    borderRadius: 8,
    padding: 10,
    marginTop: 8,
  },
  warningText: {
    flex: 1,
    fontSize: 13,
    color: "#92400e",
    lineHeight: 18,
  },

  // Cart items
  itemCard: {
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    flexDirection: "row",
    alignItems: "center",
  },
  itemInfo: {
    flex: 1,
    gap: 2,
  },
  itemName: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1f2937",
  },
  itemBarcode: {
    fontSize: 12,
    color: "#9ca3af",
  },
  itemDetailsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 2,
  },
  itemDetail: {
    fontSize: 13,
    color: "#6b7280",
  },
  itemSep: {
    fontSize: 13,
    color: "#d1d5db",
  },
  itemPrice: {
    fontSize: 13,
    fontWeight: "700",
    color: "#16a34a",
  },
  removeButton: {
    padding: 8,
  },

  // Footer actions
  footerActions: {
    marginTop: 8,
    gap: 10,
  },
  checkoutButton: {
    backgroundColor: "#16a34a",
    borderRadius: 10,
    paddingVertical: 14,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
  },
  checkoutButtonDisabled: {
    backgroundColor: "#9ca3af",
  },
  checkoutButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  clearButton: {
    alignItems: "center",
    paddingVertical: 10,
  },
  clearButtonText: {
    color: "#dc2626",
    fontSize: 14,
    fontWeight: "500",
  },

  // Checkout form
  checkoutSection: {
    marginTop: 8,
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
  },
  checkoutTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#1f2937",
    marginBottom: 16,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 4,
    marginTop: 10,
  },
  input: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: "#1f2937",
    backgroundColor: "#f9fafb",
  },
  textArea: {
    height: 80,
    paddingTop: 10,
  },
  submitButton: {
    backgroundColor: "#16a34a",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 20,
  },
  submitButtonDisabled: {
    backgroundColor: "#9ca3af",
  },
  submitButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  cancelCheckout: {
    alignItems: "center",
    paddingVertical: 12,
  },
  cancelCheckoutText: {
    color: "#6b7280",
    fontSize: 14,
  },
});
