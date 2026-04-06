import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useAuth } from "@/lib/auth";
import { profileApi } from "@/lib/api";

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

export function ProfileScreen({ navigation }: { navigation: any }) {
  const { customerId, logout } = useAuth();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", telegram: "", city: "" });

  const loadProfile = useCallback(async () => {
    if (!customerId) return;
    try {
      const data = await profileApi.get(customerId) as ProfileData;
      setProfile(data);
      setForm({
        name: data.name,
        email: data.email ?? "",
        telegram: data.telegram ?? "",
        city: data.city ?? "",
      });
    } catch {}
    setLoading(false);
  }, [customerId]);

  useEffect(() => { loadProfile(); }, [loadProfile]);

  async function handleSave() {
    if (!customerId || !form.name.trim()) return;
    try {
      await profileApi.update({
        customerId,
        name: form.name,
        email: form.email || undefined,
        telegram: form.telegram || undefined,
        city: form.city || undefined,
      });
      setEditing(false);
      loadProfile();
    } catch (error) {
      Alert.alert("Помилка", "Не вдалось зберегти");
    }
  }

  function handleLogout() {
    Alert.alert("Вихід", "Ви впевнені?", [
      { text: "Скасувати", style: "cancel" },
      { text: "Вийти", style: "destructive", onPress: logout },
    ]);
  }

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color="#16a34a" /></View>;
  }

  if (!profile) {
    return <View style={styles.center}><Text>Помилка завантаження профілю</Text></View>;
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{profile.name.charAt(0).toUpperCase()}</Text>
        </View>
        <Text style={styles.name}>{profile.name}</Text>
        <Text style={styles.phone}>{profile.phone}</Text>
        <Text style={styles.memberSince}>
          Клієнт з {new Date(profile.createdAt).toLocaleDateString("uk-UA")}
        </Text>
      </View>

      {/* Stats */}
      <View style={styles.statsRow}>
        <View style={styles.statBox}>
          <Text style={styles.statValue}>{profile.stats.totalOrders}</Text>
          <Text style={styles.statLabel}>Замовлень</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statValue}>€{profile.stats.totalSpentEur.toFixed(0)}</Text>
          <Text style={styles.statLabel}>Витрачено</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statValue}>{profile.stats.favoriteCount}</Text>
          <Text style={styles.statLabel}>Обране</Text>
        </View>
      </View>

      {/* Edit form */}
      {editing ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Редагування</Text>
          {[
            { label: "Ім'я", key: "name" as const, required: true },
            { label: "Email", key: "email" as const },
            { label: "Telegram", key: "telegram" as const, placeholder: "@username" },
            { label: "Місто", key: "city" as const },
          ].map((field) => (
            <View key={field.key} style={styles.formField}>
              <Text style={styles.fieldLabel}>{field.label}{field.required ? " *" : ""}</Text>
              <TextInput
                style={styles.fieldInput}
                value={form[field.key]}
                onChangeText={(v) => setForm((prev) => ({ ...prev, [field.key]: v }))}
                placeholder={field.placeholder}
              />
            </View>
          ))}
          <View style={styles.formActions}>
            <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
              <Text style={styles.saveText}>Зберегти</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setEditing(false)}>
              <Text style={styles.cancelText}>Скасувати</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <View style={styles.section}>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Email</Text>
            <Text style={styles.infoValue}>{profile.email ?? "—"}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Telegram</Text>
            <Text style={styles.infoValue}>{profile.telegram ?? "—"}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Місто</Text>
            <Text style={styles.infoValue}>{profile.city ?? "—"}</Text>
          </View>
          <TouchableOpacity style={styles.editButton} onPress={() => setEditing(true)}>
            <Text style={styles.editText}>Редагувати профіль</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Navigation links */}
      <View style={styles.section}>
        {[
          { title: "Мої замовлення", screen: "Orders", count: profile.stats.totalOrders },
          { title: "Обране", screen: "Favorites", count: profile.stats.favoriteCount },
          { title: "Відстеження посилок", screen: "Shipments" },
          { title: "Підписки на відеоогляди", screen: "Subscriptions", count: profile.stats.subscriptionCount },
        ].map((link) => (
          <TouchableOpacity
            key={link.screen}
            style={styles.navLink}
            onPress={() => navigation?.navigate?.(link.screen)}
          >
            <Text style={styles.navLinkText}>{link.title}</Text>
            <View style={styles.navLinkRight}>
              {link.count !== undefined && <Text style={styles.navBadge}>{link.count}</Text>}
              <Text style={styles.navArrow}>›</Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>

      {/* Logout */}
      <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
        <Text style={styles.logoutText}>Вийти з акаунту</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f5f5f5" },
  content: { paddingBottom: 40 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  header: { alignItems: "center", paddingVertical: 24, backgroundColor: "#fff" },
  avatar: {
    width: 72, height: 72, borderRadius: 36, backgroundColor: "#16a34a",
    justifyContent: "center", alignItems: "center",
  },
  avatarText: { color: "#fff", fontSize: 28, fontWeight: "bold" },
  name: { fontSize: 20, fontWeight: "bold", marginTop: 12 },
  phone: { fontSize: 14, color: "#666", marginTop: 4 },
  memberSince: { fontSize: 12, color: "#999", marginTop: 2 },
  statsRow: { flexDirection: "row", backgroundColor: "#fff", marginTop: 1, paddingVertical: 16 },
  statBox: { flex: 1, alignItems: "center" },
  statValue: { fontSize: 20, fontWeight: "bold", color: "#16a34a" },
  statLabel: { fontSize: 12, color: "#666", marginTop: 2 },
  section: { backgroundColor: "#fff", marginTop: 12, paddingHorizontal: 16, paddingVertical: 12 },
  sectionTitle: { fontSize: 16, fontWeight: "600", marginBottom: 12 },
  infoRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 10, borderBottomWidth: 1, borderColor: "#f0f0f0" },
  infoLabel: { fontSize: 14, color: "#666" },
  infoValue: { fontSize: 14, fontWeight: "500" },
  editButton: { marginTop: 12, alignItems: "center" },
  editText: { color: "#16a34a", fontSize: 14, fontWeight: "600" },
  formField: { marginBottom: 12 },
  fieldLabel: { fontSize: 13, color: "#666", marginBottom: 4 },
  fieldInput: { borderWidth: 1, borderColor: "#ddd", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  formActions: { flexDirection: "row", alignItems: "center", gap: 16, marginTop: 8 },
  saveButton: { backgroundColor: "#16a34a", paddingHorizontal: 24, paddingVertical: 10, borderRadius: 8 },
  saveText: { color: "#fff", fontWeight: "600" },
  cancelText: { color: "#666" },
  navLink: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingVertical: 14, borderBottomWidth: 1, borderColor: "#f0f0f0",
  },
  navLinkText: { fontSize: 15 },
  navLinkRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  navBadge: { fontSize: 13, color: "#666", backgroundColor: "#f0f0f0", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  navArrow: { fontSize: 20, color: "#ccc" },
  logoutButton: { marginTop: 24, marginHorizontal: 16, alignItems: "center", paddingVertical: 14 },
  logoutText: { color: "#ef4444", fontSize: 15, fontWeight: "500" },
});
