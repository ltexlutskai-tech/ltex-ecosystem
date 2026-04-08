/**
 * Main app navigator for L-TEX mobile client.
 *
 * Structure:
 * - Not logged in → LoginScreen
 * - Logged in → Bottom Tabs:
 *   - Каталог (CatalogStack: Catalog → ProductDetail)
 *   - Кошик (CartStack: Cart)
 *   - Замовлення (OrdersStack: Orders → OrderDetail)
 *   - Чат (ChatStack: Chat)
 *   - Профіль (ProfileStack: Profile → Shipments, Favorites, Subscriptions, Payments)
 */

import React from "react";
import { ActivityIndicator, View, StyleSheet } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";

import { useAuth } from "@/lib/auth";
import { AuthProvider } from "@/lib/auth-provider";

// Screens
import { LoginScreen } from "@/screens/auth/LoginScreen";
import { CatalogScreen } from "@/screens/catalog/CatalogScreen";
import { ProductScreen } from "@/screens/product/ProductScreen";
import { CartScreen } from "@/screens/cart/CartScreen";
import { OrdersScreen } from "@/screens/orders/OrdersScreen";
import { OrderDetailScreen } from "@/screens/orders/OrderDetailScreen";
import { ChatScreen } from "@/screens/chat/ChatScreen";
import { ProfileScreen } from "@/screens/profile/ProfileScreen";
import { ShipmentsScreen } from "@/screens/shipments/ShipmentsScreen";

const BRAND_COLOR = "#16a34a";

const defaultScreenOptions = {
  headerTintColor: BRAND_COLOR,
  headerBackTitle: "Назад",
  headerTitleStyle: {
    fontWeight: "600" as const,
  },
};

// ─── Type declarations for navigation params ───────────────────────────────

type CatalogStackParamList = {
  CatalogList: undefined;
  ProductDetail: { productId: string; slug: string; name: string };
};

type OrdersStackParamList = {
  OrdersList: undefined;
  OrderDetail: { orderId: string; orderCode: string };
};

type ProfileStackParamList = {
  ProfileMain: undefined;
  Shipments: undefined;
  Favorites: undefined;
  Subscriptions: undefined;
  PaymentsHistory: undefined;
};

// ─── Stack Navigators ────────────────────────────────────────────────────────

const CatalogStackNav = createNativeStackNavigator<CatalogStackParamList>();
function CatalogStackNavigator() {
  return (
    <CatalogStackNav.Navigator screenOptions={defaultScreenOptions}>
      <CatalogStackNav.Screen
        name="CatalogList"
        component={CatalogScreen}
        options={{ title: "Каталог" }}
      />
      <CatalogStackNav.Screen
        name="ProductDetail"
        component={ProductScreen as React.ComponentType<any>}
        options={{ title: "Товар" }}
      />
    </CatalogStackNav.Navigator>
  );
}

const CartStackNav = createNativeStackNavigator();
function CartStackNavigator() {
  return (
    <CartStackNav.Navigator screenOptions={defaultScreenOptions}>
      <CartStackNav.Screen
        name="CartMain"
        component={CartScreen as React.ComponentType<any>}
        options={{ title: "Кошик" }}
      />
    </CartStackNav.Navigator>
  );
}

const OrdersStackNav = createNativeStackNavigator<OrdersStackParamList>();
function OrdersStackNavigator() {
  return (
    <OrdersStackNav.Navigator screenOptions={defaultScreenOptions}>
      <OrdersStackNav.Screen
        name="OrdersList"
        component={OrdersScreen}
        options={{ title: "Замовлення" }}
      />
      <OrdersStackNav.Screen
        name="OrderDetail"
        component={OrderDetailScreen as React.ComponentType<any>}
        options={{ title: "Деталі замовлення" }}
      />
    </OrdersStackNav.Navigator>
  );
}

const ChatStackNav = createNativeStackNavigator();
function ChatStackNavigator() {
  return (
    <ChatStackNav.Navigator screenOptions={defaultScreenOptions}>
      <ChatStackNav.Screen
        name="ChatMain"
        component={ChatScreen}
        options={{ title: "Чат з менеджером" }}
      />
    </ChatStackNav.Navigator>
  );
}

const ProfileStackNav = createNativeStackNavigator<ProfileStackParamList>();
function ProfileStackNavigator() {
  return (
    <ProfileStackNav.Navigator screenOptions={defaultScreenOptions}>
      <ProfileStackNav.Screen
        name="ProfileMain"
        component={ProfileScreen as React.ComponentType<any>}
        options={{ title: "Профіль" }}
      />
      <ProfileStackNav.Screen
        name="Shipments"
        component={ShipmentsScreen}
        options={{ title: "Відправлення" }}
      />
      <ProfileStackNav.Screen
        name="Favorites"
        component={PlaceholderScreen("Обране", "heart-outline", "#dc2626")}
        options={{ title: "Обране" }}
      />
      <ProfileStackNav.Screen
        name="Subscriptions"
        component={PlaceholderScreen(
          "Підписки на відео-огляди",
          "notifications-outline",
          "#7c3aed",
        )}
        options={{ title: "Підписки" }}
      />
      <ProfileStackNav.Screen
        name="PaymentsHistory"
        component={PlaceholderScreen(
          "Історія оплат",
          "wallet-outline",
          "#0284c7",
        )}
        options={{ title: "Історія оплат" }}
      />
    </ProfileStackNav.Navigator>
  );
}

// ─── Bottom Tabs ─────────────────────────────────────────────────────────────

const Tab = createBottomTabNavigator();

const TAB_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  CatalogTab: "grid-outline",
  CartTab: "cart-outline",
  OrdersTab: "receipt-outline",
  ChatTab: "chatbubbles-outline",
  ProfileTab: "person-outline",
};

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: BRAND_COLOR,
        tabBarInactiveTintColor: "#9ca3af",
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: "500",
        },
        tabBarStyle: {
          borderTopColor: "#f3f4f6",
          paddingBottom: 4,
          paddingTop: 4,
          height: 56,
        },
        tabBarIcon: ({ color, size }) => {
          const iconName = TAB_ICONS[route.name] ?? "help-circle-outline";
          return <Ionicons name={iconName} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen
        name="CatalogTab"
        component={CatalogStackNavigator}
        options={{ tabBarLabel: "Каталог" }}
      />
      <Tab.Screen
        name="CartTab"
        component={CartStackNavigator}
        options={{ tabBarLabel: "Кошик" }}
      />
      <Tab.Screen
        name="OrdersTab"
        component={OrdersStackNavigator}
        options={{ tabBarLabel: "Замовлення" }}
      />
      <Tab.Screen
        name="ChatTab"
        component={ChatStackNavigator}
        options={{ tabBarLabel: "Чат" }}
      />
      <Tab.Screen
        name="ProfileTab"
        component={ProfileStackNavigator}
        options={{ tabBarLabel: "Профіль" }}
      />
    </Tab.Navigator>
  );
}

// ─── Root Navigator ──────────────────────────────────────────────────────────

const RootStack = createNativeStackNavigator();

function RootNavigator() {
  const { customerId, isLoading } = useAuth();

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={BRAND_COLOR} />
      </View>
    );
  }

  return (
    <RootStack.Navigator screenOptions={{ headerShown: false }}>
      {customerId ? (
        <RootStack.Screen name="Main" component={MainTabs} />
      ) : (
        <RootStack.Screen
          name="Login"
          component={LoginScreen}
          options={{ animationTypeForReplace: "pop" }}
        />
      )}
    </RootStack.Navigator>
  );
}

// ─── App Entry ───────────────────────────────────────────────────────────────

export function AppNavigator() {
  return (
    <AuthProvider>
      <NavigationContainer>
        <RootNavigator />
      </NavigationContainer>
    </AuthProvider>
  );
}

// ─── Placeholder for screens not yet built ──────────────────────────────────

function PlaceholderScreen(
  _title: string,
  icon: keyof typeof Ionicons.glyphMap,
  color: string,
) {
  return function Screen() {
    return (
      <View style={styles.placeholderContainer}>
        <Ionicons name={icon} size={48} color={color} />
        <View style={styles.placeholderTextBox}>
          <View style={styles.placeholderBadge}>
            <Ionicons name="construct-outline" size={14} color="#d97706" />
          </View>
        </View>
      </View>
    );
  };
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#fff",
  },
  placeholderContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
    backgroundColor: "#f9fafb",
  },
  placeholderTextBox: {
    marginTop: 16,
    alignItems: "center",
    gap: 8,
  },
  placeholderBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#fffbeb",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  placeholderContent: {
    alignItems: "center",
  },
});
