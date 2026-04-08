import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/lib/auth";
import { profileApi, ordersApi } from "@/lib/api";

interface ProfileData {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  telegram: string | null;
  city: string | null;
  createdAt: string;
  stats: {
    totalOrders: number;
    totalSpentEur: number;
    totalSpentUah: number;
    favoriteCount: number;
    subscriptionCount: number;
  };
}

interface ProfileScreenProps {
  navigation: {
    navigate: (screen: string, params?: Record<string, unknown>) => void;
  };
}

export function ProfileScreen({ navigation }: ProfileScreenProps) {
  const { customerId, customerName, phone, logout } = useAuth();

  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  // Editable fields
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editTelegram, setEditTelegram] = useState("");
  const [editCity, setEditCity] = useState("");

  const fetchProfile = useCallback(async () => {
    if (!customerId) return;
    try {
      const data = (await profileApi.get(customerId)) as ProfileData;
      setProfile(data);
      setEditName(data.name ?? "");
      setEditEmail(data.email ?? "");
      setEditTelegram(data.telegram ?? "");
      setEditCity(data.city ?? "");
    } catch {
      // Use auth data as fallback
      setProfile({
        id: customerId,
        name: customerName ?? "",
        phone: phone ?? "",
        email: null,
        telegram: null,
        city: null,
        createdAt: new Date().toISOString(),
        stats: {
          totalOrders: 0,
          totalSpentEur: 0,
          totalSpentUah: 0,
          favoriteCount: 0,
          subscriptionCount: 0,
        },
      });
    }
  }, [customerId, customerName, phone]);

  useEffect(() => {
    fetchProfile().finally(() => setLoading(false));
  }, [fetchProfile]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchProfile();
    setRefreshing(false);
  }, [fetchProfile]);

  const handleSave = useCallback(async () => {
    if (!customerId) return;
    if (!editName.trim()) {
      Alert.alert("Помилка", "Ім'я не може бути порожнім");
      return;
    }

    setSaving(true);
    try {
      await profileApi.update({
        customerId,
        name: editName.trim(),
        email: editEmail.trim() || undefined,
        telegram: editTelegram.trim() || undefined,
        city: editCity.trim() || undefined,
      });

      setEditing(false);
      Alert.alert("Збережено", "Профіль оновлено");
      fetchProfile();
    } catch {
      Alert.alert("Помилка", "Не вдалось зберегти зміни");
    } finally {
      setSaving(false);
    }
  }, [customerId, editName, editEmail, editTelegram, editCity, fetchProfile]);

  const handleCancelEdit = useCallback(() => {
    if (profile) {
      setEditName(profile.name ?? "");
      setEditEmail(profile.email ?? "");
      setEditTelegram(profile.telegram ?? "");
      setEditCity(profile.city ?? "");
    }
    setEditing(false);
  }, [profile]);

  const handleLogout = useCallback(() => {
    Alert.alert("Вийти?", "Ви впевнені, що хочете вийти з акаунту?", [
      { text: "Скасувати", style: "cancel" },
      {
        text: "Вийти",
        style: "destructive",
        onPress: () => logout(),
      },
    ]);
  }, [logout]);

  if (!customerId) {
    return (
      <View style={styles.centered}>
        <Ionicons name="person-outline" size={48} color="#d1d5db" />
        <Text style={styles.emptyTitle}>Увійдіть до свого акаунту</Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#16a34a" />
        <Text style={styles.loadingText}>Завантаження профілю...</Text>
      </View>
    );
  }

  if (!profile) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Помилка завантаження профілю</Text>
      </View>
    );
  }

  const stats = profile.stats;

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
      {/* Avatar + name header */}
      <View style={styles.headerSection}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {(profile.name ?? "?").charAt(0).toUpperCase()}
          </Text>
        </View>
        <Text style={styles.headerName}>{profile.name}</Text>
        <Text style={styles.headerPhone}>{profile.phone}</Text>
        <Text style={styles.memberSince}>
          Клієнт з{" "}
          {new Date(profile.createdAt).toLocaleDateString("uk-UA", {
            month: "long",
            year: "numeric",
          })}
        </Text>
      </View>

      {/* Stats */}
      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{stats.totalOrders}</Text>
          <Text style={styles.statLabel}>Замовлень</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>
            {stats.totalSpentEur > 0
              ? `${stats.totalSpentEur.toFixed(0)} EUR`
              : "0"}
          </Text>
          <Text style={styles.statLabel}>Витрачено</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{stats.favoriteCount}</Text>
          <Text style={styles.statLabel}>Обране</Text>
        </View>
      </View>

      {/* Profile info / edit form */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Особисті дані</Text>
          {!editing && (
            <TouchableOpacity onPress={() => setEditing(true)}>
              <Ionicons name="create-outline" size={20} color="#16a34a" />
            </TouchableOpacity>
          )}
        </View>

        {editing ? (
          <View style={styles.formCard}>
            <Text style={styles.fieldLabel}>Ім'я / Компанія *</Text>
            <TextInput
              style={styles.input}
              value={editName}
              onChangeText={setEditName}
              placeholder="ФОП Іваненко"
              autoComplete="name"
            />

            <Text style={styles.fieldLabel}>Email</Text>
            <TextInput
              style={styles.input}
              value={editEmail}
              onChangeText={setEditEmail}
              placeholder="email@example.com"
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
            />

            <Text style={styles.fieldLabel}>Telegram</Text>
            <TextInput
              style={styles.input}
              value={editTelegram}
              onChangeText={setEditTelegram}
              placeholder="@username"
              autoCapitalize="none"
            />

            <Text style={styles.fieldLabel}>Місто</Text>
            <TextInput
              style={styles.input}
              value={editCity}
              onChangeText={setEditCity}
              placeholder="Луцьк"
            />

            <View style={styles.formActions}>
              <TouchableOpacity
                style={[styles.saveButton, saving && styles.saveButtonDisabled]}
                onPress={handleSave}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.saveButtonText}>Зберегти</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={handleCancelEdit}
              >
                <Text style={styles.cancelButtonText}>Скасувати</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={styles.infoCard}>
            <InfoRow
              icon="person-outline"
              label="Ім'я"
              value={profile.name ?? "-"}
            />
            <InfoRow
              icon="call-outline"
              label="Телефон"
              value={profile.phone ?? "-"}
            />
            <InfoRow
              icon="mail-outline"
              label="Email"
              value={profile.email ?? "Не вказано"}
            />
            <InfoRow
              icon="paper-plane-outline"
              label="Telegram"
              value={profile.telegram ?? "Не вказано"}
            />
            <InfoRow
              icon="location-outline"
              label="Місто"
              value={profile.city ?? "Не вказано"}
            />
          </View>
        )}
      </View>

      {/* Navigation links */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Меню</Text>
        <View style={styles.menuCard}>
          <MenuItem
            icon="receipt-outline"
            iconColor="#16a34a"
            title="Мої замовлення"
            badge={
              stats.totalOrders > 0 ? String(stats.totalOrders) : undefined
            }
            onPress={() => navigation.navigate("OrdersTab")}
          />
          <View style={styles.menuDivider} />
          <MenuItem
            icon="heart-outline"
            iconColor="#dc2626"
            title="Обране"
            badge={
              stats.favoriteCount > 0 ? String(stats.favoriteCount) : undefined
            }
            onPress={() => navigation.navigate("Favorites")}
          />
          <View style={styles.menuDivider} />
          <MenuItem
            icon="notifications-outline"
            iconColor="#7c3aed"
            title="Підписки на відео-огляди"
            badge={
              stats.subscriptionCount > 0
                ? String(stats.subscriptionCount)
                : undefined
            }
            onPress={() => navigation.navigate("Subscriptions")}
          />
          <View style={styles.menuDivider} />
          <MenuItem
            icon="wallet-outline"
            iconColor="#0284c7"
            title="Історія оплат"
            onPress={() => navigation.navigate("PaymentsHistory")}
          />
          <View style={styles.menuDivider} />
          <MenuItem
            icon="car-outline"
            iconColor="#d97706"
            title="Відправлення"
            onPress={() => navigation.navigate("Shipments")}
          />
        </View>
      </View>

      {/* Company info */}
      <View style={styles.section}>
        <View style={styles.companyCard}>
          <Text style={styles.companyName}>L-TEX</Text>
          <Text style={styles.companyDescription}>
            Секонд хенд, сток, іграшки, Bric-a-Brac{"\n"}
            гуртом від 10 кг
          </Text>
          <Text style={styles.companyContact}>
            Telegram: @L_TEX{"\n"}
            +380 67 671 05 15{"\n"}
            +380 99 358 49 92
          </Text>
        </View>
      </View>

      {/* Logout */}
      <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
        <Ionicons name="log-out-outline" size={20} color="#dc2626" />
        <Text style={styles.logoutButtonText}>Вийти з акаунту</Text>
      </TouchableOpacity>

      <View style={styles.bottomSpacer} />
    </ScrollView>
  );
}

// ─── Reusable sub-components ────────────────────────────────────────────────

function InfoRow({
  icon,
  label,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.infoRow}>
      <Ionicons name={icon} size={18} color="#6b7280" />
      <View style={styles.infoContent}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={styles.infoValue}>{value}</Text>
      </View>
    </View>
  );
}

function MenuItem({
  icon,
  iconColor,
  title,
  badge,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  title: string;
  badge?: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.menuItem} onPress={onPress}>
      <Ionicons name={icon} size={20} color={iconColor} />
      <Text style={styles.menuItemText}>{title}</Text>
      {badge && (
        <View style={styles.menuBadge}>
          <Text style={styles.menuBadgeText}>{badge}</Text>
        </View>
      )}
      <Ionicons name="chevron-forward" size={18} color="#d1d5db" />
    </TouchableOpacity>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

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
    padding: 32,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#4b5563",
    marginTop: 16,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: "#6b7280",
  },
  errorText: {
    fontSize: 16,
    color: "#6b7280",
  },

  // Header
  headerSection: {
    alignItems: "center",
    paddingTop: 24,
    paddingBottom: 20,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#16a34a",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
  },
  avatarText: {
    fontSize: 28,
    fontWeight: "700",
    color: "#fff",
  },
  headerName: {
    fontSize: 20,
    fontWeight: "700",
    color: "#1f2937",
  },
  headerPhone: {
    fontSize: 14,
    color: "#6b7280",
    marginTop: 4,
  },
  memberSince: {
    fontSize: 12,
    color: "#9ca3af",
    marginTop: 2,
  },

  // Stats
  statsRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 10,
  },
  statCard: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 14,
    alignItems: "center",
    elevation: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  statValue: {
    fontSize: 18,
    fontWeight: "700",
    color: "#16a34a",
  },
  statLabel: {
    fontSize: 11,
    color: "#6b7280",
    marginTop: 4,
  },

  // Sections
  section: {
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1f2937",
    marginBottom: 10,
  },

  // Info card
  infoCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 4,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  infoContent: {
    flex: 1,
  },
  infoLabel: {
    fontSize: 11,
    color: "#9ca3af",
    textTransform: "uppercase",
  },
  infoValue: {
    fontSize: 14,
    fontWeight: "500",
    color: "#1f2937",
    marginTop: 1,
  },

  // Form
  formCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#374151",
    marginTop: 10,
    marginBottom: 4,
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
  formActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 16,
  },
  saveButton: {
    flex: 1,
    backgroundColor: "#16a34a",
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
  },
  cancelButton: {
    flex: 1,
    backgroundColor: "#f3f4f6",
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
  },
  cancelButtonText: {
    color: "#6b7280",
    fontSize: 15,
    fontWeight: "500",
  },

  // Menu
  menuCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    overflow: "hidden",
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  menuItemText: {
    flex: 1,
    fontSize: 15,
    fontWeight: "500",
    color: "#1f2937",
  },
  menuBadge: {
    backgroundColor: "#f0fdf4",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    marginRight: 4,
  },
  menuBadgeText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#16a34a",
  },
  menuDivider: {
    height: 1,
    backgroundColor: "#f3f4f6",
    marginLeft: 48,
  },

  // Company info
  companyCard: {
    backgroundColor: "#f0fdf4",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: "#bbf7d0",
  },
  companyName: {
    fontSize: 20,
    fontWeight: "700",
    color: "#16a34a",
  },
  companyDescription: {
    fontSize: 13,
    color: "#4b5563",
    textAlign: "center",
    lineHeight: 18,
  },
  companyContact: {
    fontSize: 12,
    color: "#6b7280",
    textAlign: "center",
    lineHeight: 18,
    marginTop: 4,
  },

  // Logout
  logoutButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginHorizontal: 16,
    marginTop: 12,
    paddingVertical: 14,
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#fecaca",
  },
  logoutButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#dc2626",
  },
  bottomSpacer: {
    height: 24,
  },
});
