import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/lib/auth";
import { RegionPicker } from "@/components/RegionPicker";

export function LoginScreen() {
  const { login } = useAuth();
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [city, setCity] = useState<string | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [loading, setLoading] = useState(false);
  const [regionPickerOpen, setRegionPickerOpen] = useState(false);

  async function handleSubmit() {
    if (phone.length < 10) {
      Alert.alert("Помилка", "Введіть коректний номер телефону");
      return;
    }
    if (isNew && !name.trim()) {
      Alert.alert("Помилка", "Введіть ваше ім'я");
      return;
    }

    setLoading(true);
    try {
      await login(phone, isNew ? name : undefined, city ?? undefined);
    } catch (error) {
      Alert.alert(
        "Помилка",
        error instanceof Error ? error.message : "Не вдалось увійти",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View style={styles.header}>
        <Text style={styles.logo}>L-TEX</Text>
        <Text style={styles.subtitle}>
          Секонд хенд, сток, іграшки{"\n"}гуртом від 10 кг
        </Text>
      </View>

      <View style={styles.form}>
        <Text style={styles.label}>Телефон</Text>
        <TextInput
          style={styles.input}
          value={phone}
          onChangeText={setPhone}
          placeholder="+380..."
          keyboardType="phone-pad"
          autoComplete="tel"
        />

        {isNew && (
          <>
            <Text style={styles.label}>Ім'я / Назва компанії</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="ФОП Іваненко"
              autoComplete="name"
            />
          </>
        )}

        <Text style={styles.label}>Область</Text>
        <TouchableOpacity
          style={styles.pickerButton}
          onPress={() => setRegionPickerOpen(true)}
          accessibilityRole="button"
          accessibilityLabel="Обрати область"
          activeOpacity={0.7}
        >
          <Text
            style={[
              styles.pickerButtonText,
              !city && styles.pickerButtonPlaceholder,
            ]}
          >
            {city ?? "— Не обрано —"}
          </Text>
          <Ionicons name="chevron-down" size={18} color="#6b7280" />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleSubmit}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>
              {isNew ? "Зареєструватися" : "Увійти"}
            </Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity onPress={() => setIsNew(!isNew)}>
          <Text style={styles.switchText}>
            {isNew ? "Вже є акаунт? Увійти" : "Новий клієнт? Зареєструватися"}
          </Text>
        </TouchableOpacity>
      </View>

      <RegionPicker
        visible={regionPickerOpen}
        selected={city}
        onSelect={setCity}
        onClose={() => setRegionPickerOpen(false)}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
    justifyContent: "center",
    padding: 24,
  },
  header: { alignItems: "center", marginBottom: 40 },
  logo: { fontSize: 36, fontWeight: "bold", color: "#16a34a" },
  subtitle: { fontSize: 14, color: "#666", textAlign: "center", marginTop: 8 },
  form: { gap: 12 },
  label: { fontSize: 14, fontWeight: "600", color: "#333" },
  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
  },
  pickerButton: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#fff",
  },
  pickerButtonText: {
    fontSize: 16,
    color: "#1f2937",
  },
  pickerButtonPlaceholder: {
    color: "#9ca3af",
  },
  button: {
    backgroundColor: "#16a34a",
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 8,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  switchText: {
    color: "#16a34a",
    textAlign: "center",
    marginTop: 12,
    fontSize: 14,
  },
});
