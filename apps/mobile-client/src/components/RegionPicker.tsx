import React from "react";
import {
  Modal,
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { UA_REGIONS } from "@/lib/labels";

interface RegionPickerProps {
  visible: boolean;
  selected: string | null;
  onSelect: (region: string | null) => void;
  onClose: () => void;
}

/**
 * Bottom-sheet modal for picking an Ukrainian region. Reused by the login
 * screen and the profile-edit screen. Mirrors the visual language of
 * CatalogFilterSheet (Pressable backdrop, slide animation, drag handle).
 */
export function RegionPicker({
  visible,
  selected,
  onSelect,
  onClose,
}: RegionPickerProps) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose} />

      <View style={styles.sheet}>
        <View style={styles.handle} />
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Оберіть область</Text>
          <TouchableOpacity
            onPress={onClose}
            hitSlop={12}
            accessibilityLabel="Закрити"
          >
            <Ionicons name="close" size={24} color="#1f2937" />
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.list}
          contentContainerStyle={styles.listContent}
        >
          <Pressable
            style={[styles.row, selected == null && styles.rowActive]}
            onPress={() => {
              onSelect(null);
              onClose();
            }}
          >
            <Text
              style={[styles.rowText, selected == null && styles.rowTextActive]}
            >
              — Не обрано —
            </Text>
            {selected == null ? (
              <Ionicons name="checkmark" size={20} color="#16a34a" />
            ) : null}
          </Pressable>
          {UA_REGIONS.map((region) => {
            const active = selected === region;
            return (
              <Pressable
                key={region}
                style={[styles.row, active && styles.rowActive]}
                onPress={() => {
                  onSelect(region);
                  onClose();
                }}
              >
                <Text style={[styles.rowText, active && styles.rowTextActive]}>
                  {region}
                </Text>
                {active ? (
                  <Ionicons name="checkmark" size={20} color="#16a34a" />
                ) : null}
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.4)",
  },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: "75%",
    backgroundColor: "#fff",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingTop: 8,
  },
  handle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#d1d5db",
    marginBottom: 6,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1f2937",
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingVertical: 8,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  rowActive: {
    backgroundColor: "#f0fdf4",
  },
  rowText: {
    fontSize: 15,
    color: "#1f2937",
  },
  rowTextActive: {
    color: "#16a34a",
    fontWeight: "600",
  },
});
