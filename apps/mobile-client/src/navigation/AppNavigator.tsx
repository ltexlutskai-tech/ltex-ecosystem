/**
 * Main app navigator for L-TEX mobile client.
 *
 * Structure (S33 Rozetka-style restructure):
 * - Bottom Tabs (4 tabs):
 *   - Головна (HomeStack: HomeMain -> Catalog/ProductDetail/Lots/Wishlist/Notifications) — public
 *   - Пошук (SearchStack: SearchMain -> ProductDetail) — public
 *   - Кошик (CartStack: Cart) — public
 *   - Ще (MoreStack: MoreMain -> Profile/Orders/Chat/Shipments/...) — auth-guarded
 *
 * Floating chat button (MessengerFab) bottom-right above tab bar.
 * Auth guard: MoreStack redirects to LoginScreen if not authenticated.
 * Deep linking: ltex://product/[slug], ltex://order/[id], ltex://catalog, ltex://search, ltex://more
 */

import React, { useEffect } from "react";
import {
  ActivityIndicator,
  TouchableOpacity,
  View,
  Text,
  StyleSheet,
} from "react-native";
import {
  NavigationContainer,
  type LinkingOptions,
} from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import * as Linking from "expo-linking";

import { useAuth } from "@/lib/auth";
import { AuthProvider } from "@/lib/auth-provider";
import { WishlistProvider } from "@/lib/wishlist-provider";
import { ChatUnreadProvider } from "@/lib/chat-unread-provider";
import { useChatUnread } from "@/lib/chat-unread";
import { OfflineBanner } from "@/components/OfflineBanner";
import { MessengerFab } from "@/components/MessengerFab";
import { registerPushToken } from "@/lib/notifications";

// Screens
import { LoginScreen } from "@/screens/auth/LoginScreen";
import { HomeScreen } from "@/screens/home/HomeScreen";
import { SearchScreen } from "@/screens/search/SearchScreen";
import { MoreScreen } from "@/screens/more/MoreScreen";
import { CatalogScreen } from "@/screens/catalog/CatalogScreen";
import { ProductScreen } from "@/screens/product/ProductScreen";
import { CartScreen } from "@/screens/cart/CartScreen";
import { OrdersScreen } from "@/screens/orders/OrdersScreen";
import { OrderDetailScreen } from "@/screens/orders/OrderDetailScreen";
import { ChatScreen } from "@/screens/chat/ChatScreen";
import { ProfileScreen } from "@/screens/profile/ProfileScreen";
import { ShipmentsScreen } from "@/screens/shipments/ShipmentsScreen";
import { NotificationsScreen } from "@/screens/notifications/NotificationsScreen";
import { WishlistScreen } from "@/screens/wishlist/WishlistScreen";
import { LotsScreen } from "@/screens/lots/LotsScreen";

const BRAND_COLOR = "#16a34a";

const defaultScreenOptions = {
  headerTintColor: BRAND_COLOR,
  headerBackTitle: "Назад",
  headerTitleStyle: {
    fontWeight: "600" as const,
  },
};

// ─── Type declarations for navigation params ───────────────────────────────

type HomeStackParamList = {
  HomeMain: undefined;
  Catalog: { categorySlug?: string } | undefined;
  ProductDetail: { productId: string; slug: string; name: string };
  Lots: undefined;
  Wishlist: undefined;
  Notifications: undefined;
};

type SearchStackParamList = {
  SearchMain: { q?: string } | undefined;
  ProductDetail: { productId: string; slug: string; name: string };
};

type MoreStackParamList = {
  MoreMain: undefined;
  Profile: undefined;
  Orders: undefined;
  OrderDetail: { orderId: string; orderCode: string };
  Chat: undefined;
  Shipments: undefined;
  Subscriptions: undefined;
  PaymentsHistory: undefined;
  Favorites: undefined;
};

// ─── Auth Guard ─────────────────────────────────────────────────────────────

/**
 * HOC that wraps a stack navigator with an auth guard.
 * If the user is not authenticated, shows the LoginScreen instead.
 */
function withAuthGuard(
  WrappedNavigator: React.ComponentType,
): React.ComponentType {
  return function AuthGuardedNavigator() {
    const { customerId } = useAuth();
    if (!customerId) {
      return <LoginScreen />;
    }
    return <WrappedNavigator />;
  };
}

// ─── Stack Navigators ────────────────────────────────────────────────────────

const HomeStackNav = createNativeStackNavigator<HomeStackParamList>();
function HomeStackNavigator() {
  return (
    <HomeStackNav.Navigator screenOptions={defaultScreenOptions}>
      <HomeStackNav.Screen
        name="HomeMain"
        component={HomeScreen}
        options={({ navigation }) => ({
          title: "L-TEX",
          headerRight: () => (
            <TouchableOpacity
              onPress={() => navigation.navigate("Notifications")}
              style={styles.headerIconButton}
              accessibilityLabel="Сповіщення"
            >
              <Ionicons
                name="notifications-outline"
                size={22}
                color={BRAND_COLOR}
              />
            </TouchableOpacity>
          ),
        })}
      />
      <HomeStackNav.Screen
        name="Catalog"
        component={CatalogScreen}
        options={{ title: "Каталог" }}
      />
      <HomeStackNav.Screen
        name="ProductDetail"
        component={ProductScreen as React.ComponentType<any>}
        options={{ title: "Товар" }}
      />
      <HomeStackNav.Screen
        name="Lots"
        component={LotsScreen}
        options={{ title: "Лоти" }}
      />
      <HomeStackNav.Screen
        name="Wishlist"
        component={WishlistScreen}
        options={{ title: "Обране" }}
      />
      <HomeStackNav.Screen
        name="Notifications"
        component={NotificationsScreen}
        options={{ title: "Сповіщення" }}
      />
    </HomeStackNav.Navigator>
  );
}

const SearchStackNav = createNativeStackNavigator<SearchStackParamList>();
function SearchStackNavigator() {
  return (
    <SearchStackNav.Navigator screenOptions={defaultScreenOptions}>
      <SearchStackNav.Screen
        name="SearchMain"
        component={SearchScreen}
        options={{ title: "Пошук" }}
      />
      <SearchStackNav.Screen
        name="ProductDetail"
        component={ProductScreen as React.ComponentType<any>}
        options={{ title: "Товар" }}
      />
    </SearchStackNav.Navigator>
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

const MoreStackNav = createNativeStackNavigator<MoreStackParamList>();
function MoreStackNavigatorInner() {
  return (
    <MoreStackNav.Navigator screenOptions={defaultScreenOptions}>
      <MoreStackNav.Screen
        name="MoreMain"
        component={MoreScreen}
        options={{ title: "Ще" }}
      />
      <MoreStackNav.Screen
        name="Profile"
        component={ProfileScreen as React.ComponentType<any>}
        options={{ title: "Профіль" }}
      />
      <MoreStackNav.Screen
        name="Orders"
        component={OrdersScreen}
        options={{ title: "Замовлення" }}
      />
      <MoreStackNav.Screen
        name="OrderDetail"
        component={OrderDetailScreen as React.ComponentType<any>}
        options={{ title: "Деталі замовлення" }}
      />
      <MoreStackNav.Screen
        name="Chat"
        component={ChatScreen}
        options={{ title: "Чат з менеджером" }}
      />
      <MoreStackNav.Screen
        name="Shipments"
        component={ShipmentsScreen}
        options={{ title: "Відправлення" }}
      />
      <MoreStackNav.Screen
        name="Subscriptions"
        component={PlaceholderScreen(
          "Підписки на відео-огляди",
          "notifications-outline",
          "#7c3aed",
        )}
        options={{ title: "Підписки" }}
      />
      <MoreStackNav.Screen
        name="PaymentsHistory"
        component={PlaceholderScreen(
          "Історія оплат",
          "wallet-outline",
          "#0284c7",
        )}
        options={{ title: "Історія оплат" }}
      />
      <MoreStackNav.Screen
        name="Favorites"
        component={PlaceholderScreen("Обране", "heart-outline", "#dc2626")}
        options={{ title: "Обране" }}
      />
    </MoreStackNav.Navigator>
  );
}
const MoreStackNavigator = withAuthGuard(MoreStackNavigatorInner);

// ─── Deep Linking Configuration ─────────────────────────────────────────────

const prefix = Linking.createURL("/");

const linking: LinkingOptions<Record<string, unknown>> = {
  prefixes: [prefix, "ltex://"],
  config: {
    screens: {
      Main: {
        screens: {
          HomeTab: {
            screens: {
              HomeMain: "",
              Catalog: "catalog",
              ProductDetail: "product/:slug",
              Lots: "lots",
              Wishlist: "wishlist",
              Notifications: "notifications",
            },
          },
          SearchTab: {
            screens: {
              SearchMain: "search",
            },
          },
          CartTab: {
            screens: {
              CartMain: "cart",
            },
          },
          MoreTab: {
            screens: {
              MoreMain: "more",
              Profile: "profile",
              Orders: "orders",
              OrderDetail: "order/:orderId",
              Chat: "chat",
              Shipments: "shipments",
            },
          },
        },
      },
    },
  },
};

// ─── Bottom Tabs ─────────────────────────────────────────────────────────────

const Tab = createBottomTabNavigator();

const TAB_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  HomeTab: "home-outline",
  SearchTab: "search-outline",
  CartTab: "cart-outline",
  MoreTab: "ellipsis-horizontal-outline",
};

function MainTabs() {
  const { count } = useChatUnread();
  const moreBadge = count > 0 ? (count > 9 ? "9+" : String(count)) : undefined;
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
        name="HomeTab"
        component={HomeStackNavigator}
        options={{ tabBarLabel: "Головна" }}
      />
      <Tab.Screen
        name="SearchTab"
        component={SearchStackNavigator}
        options={{ tabBarLabel: "Пошук" }}
      />
      <Tab.Screen
        name="CartTab"
        component={CartStackNavigator}
        options={{ tabBarLabel: "Кошик" }}
      />
      <Tab.Screen
        name="MoreTab"
        component={MoreStackNavigator}
        options={{
          tabBarLabel: "Ще",
          tabBarBadge: moreBadge,
          tabBarBadgeStyle: {
            backgroundColor: "#dc2626",
            color: "#fff",
            fontSize: 10,
          },
        }}
      />
    </Tab.Navigator>
  );
}

// ─── Splash / Loading Screen ────────────────────────────────────────────────

function SplashScreen() {
  return (
    <View style={styles.splashContainer}>
      <Text style={styles.splashLogo}>L-TEX</Text>
      <Text style={styles.splashTagline}>
        Секонд хенд, сток, іграшки{"\n"}гуртом від 10 кг
      </Text>
      <ActivityIndicator
        size="large"
        color="#fff"
        style={styles.splashSpinner}
      />
    </View>
  );
}

// ─── Root Navigator ──────────────────────────────────────────────────────────

const RootStack = createNativeStackNavigator();

function RootNavigator() {
  const { customerId, isLoading } = useAuth();

  // Register push token when logged in
  useEffect(() => {
    if (customerId) {
      registerPushToken().catch(() => {});
    }
  }, [customerId]);

  if (isLoading) {
    return <SplashScreen />;
  }

  return (
    <View style={{ flex: 1 }}>
      <OfflineBanner />
      <RootStack.Navigator screenOptions={{ headerShown: false }}>
        <RootStack.Screen name="Main" component={MainTabs} />
      </RootStack.Navigator>
      <MessengerFab />
    </View>
  );
}

// ─── App Entry ───────────────────────────────────────────────────────────────

export function AppNavigator() {
  return (
    <AuthProvider>
      <WishlistProvider>
        <ChatUnreadProvider>
          <NavigationContainer linking={linking} fallback={<SplashScreen />}>
            <RootNavigator />
          </NavigationContainer>
        </ChatUnreadProvider>
      </WishlistProvider>
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
  // Splash / Loading
  splashContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: BRAND_COLOR,
  },
  splashLogo: {
    fontSize: 48,
    fontWeight: "bold",
    color: "#fff",
    letterSpacing: 2,
  },
  splashTagline: {
    fontSize: 14,
    color: "rgba(255,255,255,0.85)",
    textAlign: "center",
    marginTop: 12,
    lineHeight: 20,
  },
  splashSpinner: {
    marginTop: 32,
  },

  // Header
  headerIconButton: {
    paddingHorizontal: 12,
  },

  // Placeholder
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
