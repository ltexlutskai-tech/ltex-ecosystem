/**
 * Main app navigator for L-TEX mobile client.
 *
 * Structure:
 * - Not logged in → LoginScreen
 * - Logged in → Bottom Tabs:
 *   - Каталог (CatalogStack: Catalog → Product)
 *   - Кошик (CartScreen)
 *   - Замовлення (OrdersStack: Orders → OrderDetail)
 *   - Чат (ChatScreen)
 *   - Профіль (ProfileStack: Profile → Shipments)
 */

import React from "react";
import { ActivityIndicator, View } from "react-native";
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

// ─── Stack Navigators ────────────────────────────────────────────────────────

const CatalogStack = createNativeStackNavigator();
function CatalogStackNavigator() {
  return (
    <CatalogStack.Navigator screenOptions={{ headerTintColor: BRAND_COLOR }}>
      <CatalogStack.Screen name="CatalogList" component={CatalogScreen} options={{ title: "Каталог" }} />
      <CatalogStack.Screen name="Product" component={ProductScreen} options={{ title: "Товар" }} />
    </CatalogStack.Navigator>
  );
}

const OrdersStack = createNativeStackNavigator();
function OrdersStackNavigator() {
  return (
    <OrdersStack.Navigator screenOptions={{ headerTintColor: BRAND_COLOR }}>
      <OrdersStack.Screen name="OrdersList" component={OrdersScreen} options={{ title: "Замовлення" }} />
      <OrdersStack.Screen name="OrderDetail" component={OrderDetailScreen} options={{ title: "Деталі замовлення" }} />
    </OrdersStack.Navigator>
  );
}

const ProfileStack = createNativeStackNavigator();
function ProfileStackNavigator() {
  return (
    <ProfileStack.Navigator screenOptions={{ headerTintColor: BRAND_COLOR }}>
      <ProfileStack.Screen name="ProfileMain" component={ProfileScreen} options={{ title: "Профіль" }} />
      <ProfileStack.Screen name="Shipments" component={ShipmentsScreen} options={{ title: "Відстеження посилок" }} />
    </ProfileStack.Navigator>
  );
}

// ─── Bottom Tabs ─────────────────────────────────────────────────────────────

const Tab = createBottomTabNavigator();

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: BRAND_COLOR,
        tabBarInactiveTintColor: "#9ca3af",
        tabBarIcon: ({ color, size }) => {
          let iconName: keyof typeof Ionicons.glyphMap = "help-circle-outline";
          if (route.name === "Catalog") iconName = "grid-outline";
          else if (route.name === "Cart") iconName = "cart-outline";
          else if (route.name === "Orders") iconName = "receipt-outline";
          else if (route.name === "Chat") iconName = "chatbubbles-outline";
          else if (route.name === "Profile") iconName = "person-outline";
          return <Ionicons name={iconName} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Catalog" component={CatalogStackNavigator} options={{ tabBarLabel: "Каталог" }} />
      <Tab.Screen name="Cart" component={CartScreen} options={{ tabBarLabel: "Кошик", headerShown: true, title: "Кошик" }} />
      <Tab.Screen name="Orders" component={OrdersStackNavigator} options={{ tabBarLabel: "Замовлення" }} />
      <Tab.Screen name="Chat" component={ChatScreen} options={{ tabBarLabel: "Чат", headerShown: true, title: "Чат з менеджером" }} />
      <Tab.Screen name="Profile" component={ProfileStackNavigator} options={{ tabBarLabel: "Профіль" }} />
    </Tab.Navigator>
  );
}

// ─── Root Navigator ──────────────────────────────────────────────────────────

const RootStack = createNativeStackNavigator();

function RootNavigator() {
  const { customerId, isLoading } = useAuth();

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" color={BRAND_COLOR} />
      </View>
    );
  }

  return (
    <RootStack.Navigator screenOptions={{ headerShown: false }}>
      {customerId ? (
        <RootStack.Screen name="Main" component={MainTabs} />
      ) : (
        <RootStack.Screen name="Login" component={LoginScreen} />
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
