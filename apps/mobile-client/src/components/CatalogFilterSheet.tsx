import React, { useEffect, useState } from "react";
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Pressable,
  ScrollView,
  StyleSheet,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  QUALITY_LEVELS,
  QUALITY_LABELS,
  SEASONS,
  SEASON_LABELS,
  COUNTRIES,
  COUNTRY_LABELS,
  COUNTRY_SHORT,
  SORT_OPTIONS,
} from "@/lib/labels";

export interface CatalogFilters {
  q?: string;
  quality?: string;
  season?: string;
  country?: string;
  sort?: string;
  priceMin?: number;
  priceMax?: number;
  inStock?: boolean;
}

interface CatalogFilterSheetProps {
  visible: boolean;
  onClose: () => void;
  initialFilters: CatalogFilters;
  onApply: (filters: CatalogFilters) => void;
}

const EMPTY_FILTERS: CatalogFilters = {};

/**
 * Counts how many "active" filters there are — useful for showing a small
 * badge over the filter button on the catalog screen.
 */
export function countActiveFilters(filters: CatalogFilters): number {
  let n = 0;
  if (filters.q && filters.q.trim()) n++;
  if (filters.quality) n++;
  if (filters.season) n++;
  if (filters.country) n++;
  if (filters.sort) n++;
  if (filters.priceMin !== undefined) n++;
  if (filters.priceMax !== undefined) n++;
  if (filters.inStock) n++;
  return n;
}

/**
 * Bottom-sheet style filter modal mirroring the web `<CatalogFilters />`.
 * Uses the React Native `Modal` (no extra deps like @gorhom/bottom-sheet).
 */
export function CatalogFilterSheet({
  visible,
  onClose,
  initialFilters,
  onApply,
}: CatalogFilterSheetProps) {
  // Local draft state — values are only committed on "Застосувати"
  const [draft, setDraft] = useState<CatalogFilters>(initialFilters);
  const [priceMinText, setPriceMinText] = useState<string>(
    initialFilters.priceMin !== undefined
      ? String(initialFilters.priceMin)
      : "",
  );
  const [priceMaxText, setPriceMaxText] = useState<string>(
    initialFilters.priceMax !== undefined
      ? String(initialFilters.priceMax)
      : "",
  );

  // Re-sync when sheet re-opens with new external filters
  useEffect(() => {
    if (visible) {
      setDraft(initialFilters);
      setPriceMinText(
        initialFilters.priceMin !== undefined
          ? String(initialFilters.priceMin)
          : "",
      );
      setPriceMaxText(
        initialFilters.priceMax !== undefined
          ? String(initialFilters.priceMax)
          : "",
      );
    }
  }, [visible, initialFilters]);

  const update = <K extends keyof CatalogFilters>(
    key: K,
    value: CatalogFilters[K],
  ) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  const toggle = <K extends keyof CatalogFilters>(
    key: K,
    value: CatalogFilters[K],
  ) => {
    setDraft((prev) => ({
      ...prev,
      [key]: prev[key] === value ? undefined : value,
    }));
  };

  const handleApply = () => {
    const finalFilters: CatalogFilters = { ...draft };
    const minNum = priceMinText.trim() ? Number(priceMinText) : NaN;
    const maxNum = priceMaxText.trim() ? Number(priceMaxText) : NaN;
    finalFilters.priceMin = Number.isFinite(minNum) ? minNum : undefined;
    finalFilters.priceMax = Number.isFinite(maxNum) ? maxNum : undefined;
    onApply(finalFilters);
    onClose();
  };

  const handleResetAll = () => {
    setDraft(EMPTY_FILTERS);
    setPriceMinText("");
    setPriceMaxText("");
  };

  const hasAnyFilter =
    countActiveFilters({
      ...draft,
      priceMin: priceMinText.trim() ? Number(priceMinText) : undefined,
      priceMax: priceMaxText.trim() ? Number(priceMaxText) : undefined,
    }) > 0;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      {/* Backdrop — taps close the sheet */}
      <Pressable style={styles.backdrop} onPress={onClose} />

      <View style={styles.sheet}>
        {/* Drag handle */}
        <View style={styles.handle} />

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Фільтри</Text>
          <TouchableOpacity
            onPress={onClose}
            hitSlop={12}
            accessibilityLabel="Закрити"
          >
            <Ionicons name="close" size={24} color="#1f2937" />
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.body}
          contentContainerStyle={styles.bodyContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Search */}
          <View style={styles.field}>
            <Text style={styles.label}>Пошук</Text>
            <TextInput
              style={styles.input}
              value={draft.q ?? ""}
              onChangeText={(v) => update("q", v)}
              placeholder="Пошук товарів..."
              placeholderTextColor="#9ca3af"
              returnKeyType="search"
              clearButtonMode="while-editing"
            />
          </View>

          {/* Quality */}
          <View style={styles.field}>
            <Text style={styles.label}>Якість</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipRow}
            >
              {QUALITY_LEVELS.map((q) => (
                <Chip
                  key={q}
                  label={QUALITY_LABELS[q] ?? q}
                  active={draft.quality === q}
                  onPress={() => toggle("quality", q)}
                />
              ))}
            </ScrollView>
          </View>

          {/* Season */}
          <View style={styles.field}>
            <Text style={styles.label}>Сезон</Text>
            <View style={styles.chipRowWrap}>
              {SEASONS.map((s) => (
                <Chip
                  key={s}
                  label={SEASON_LABELS[s] ?? s}
                  active={draft.season === s}
                  onPress={() => toggle("season", s)}
                />
              ))}
            </View>
          </View>

          {/* Country */}
          <View style={styles.field}>
            <Text style={styles.label}>Країна</Text>
            <View style={styles.chipRowWrap}>
              {COUNTRIES.map((c) => (
                <Chip
                  key={c}
                  label={`${COUNTRY_SHORT[c] ?? c.toUpperCase()} ${COUNTRY_LABELS[c] ?? c}`}
                  active={draft.country === c}
                  onPress={() => toggle("country", c)}
                />
              ))}
            </View>
          </View>

          {/* Sort */}
          <View style={styles.field}>
            <Text style={styles.label}>Сортування</Text>
            <View style={styles.chipRowWrap}>
              {SORT_OPTIONS.map((opt) => (
                <Chip
                  key={opt.key || "default"}
                  label={opt.label}
                  active={(draft.sort ?? "") === opt.key}
                  onPress={() =>
                    update("sort", opt.key === "" ? undefined : opt.key)
                  }
                />
              ))}
            </View>
          </View>

          {/* Price range */}
          <View style={styles.field}>
            <Text style={styles.label}>Ціна (EUR)</Text>
            <View style={styles.priceRow}>
              <TextInput
                style={[styles.input, styles.priceInput]}
                value={priceMinText}
                onChangeText={setPriceMinText}
                placeholder="від"
                placeholderTextColor="#9ca3af"
                keyboardType="numeric"
                inputMode="decimal"
              />
              <Text style={styles.priceDash}>—</Text>
              <TextInput
                style={[styles.input, styles.priceInput]}
                value={priceMaxText}
                onChangeText={setPriceMaxText}
                placeholder="до"
                placeholderTextColor="#9ca3af"
                keyboardType="numeric"
                inputMode="decimal"
              />
            </View>
          </View>

          {/* In stock */}
          <TouchableOpacity
            style={styles.checkboxRow}
            onPress={() => update("inStock", !draft.inStock)}
            activeOpacity={0.7}
          >
            <View
              style={[styles.checkbox, draft.inStock && styles.checkboxChecked]}
            >
              {draft.inStock ? (
                <Ionicons name="checkmark" size={14} color="#fff" />
              ) : null}
            </View>
            <Text style={styles.checkboxLabel}>Тільки в наявності</Text>
          </TouchableOpacity>
        </ScrollView>

        {/* Footer actions */}
        <View style={styles.footer}>
          {hasAnyFilter ? (
            <TouchableOpacity
              style={styles.resetButton}
              onPress={handleResetAll}
              activeOpacity={0.7}
            >
              <Text style={styles.resetButtonText}>Скинути все</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity
            style={styles.applyButton}
            onPress={handleApply}
            activeOpacity={0.85}
          >
            <Text style={styles.applyButtonText}>Застосувати</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

interface ChipProps {
  label: string;
  active: boolean;
  onPress: () => void;
}

function Chip({ label, active, onPress }: ChipProps) {
  return (
    <TouchableOpacity
      style={[styles.chip, active && styles.chipActive]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>
        {label}
      </Text>
    </TouchableOpacity>
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
    height: "85%",
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
  body: {
    flex: 1,
  },
  bodyContent: {
    padding: 16,
    gap: 16,
    paddingBottom: 24,
  },
  field: {
    gap: 6,
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 4,
  },
  input: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 14,
    color: "#1f2937",
  },
  chipRow: {
    gap: 8,
    paddingRight: 16,
  },
  chipRowWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  chipActive: {
    backgroundColor: "#16a34a",
    borderColor: "#16a34a",
  },
  chipText: {
    fontSize: 13,
    color: "#4b5563",
    fontWeight: "500",
  },
  chipTextActive: {
    color: "#fff",
  },
  priceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  priceInput: {
    flex: 1,
  },
  priceDash: {
    color: "#9ca3af",
    fontSize: 16,
  },
  checkboxRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "#d1d5db",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
  },
  checkboxChecked: {
    backgroundColor: "#16a34a",
    borderColor: "#16a34a",
  },
  checkboxLabel: {
    fontSize: 14,
    color: "#1f2937",
  },
  footer: {
    flexDirection: "column",
    gap: 8,
    padding: 16,
    paddingBottom: 24,
    borderTopWidth: 1,
    borderTopColor: "#f3f4f6",
    backgroundColor: "#fff",
  },
  resetButton: {
    borderWidth: 1,
    borderColor: "#fecaca",
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
  },
  resetButtonText: {
    color: "#dc2626",
    fontSize: 14,
    fontWeight: "600",
  },
  applyButton: {
    backgroundColor: "#16a34a",
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: "center",
  },
  applyButtonText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },
});
