import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
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
import { categoriesApi, catalogApi, type MobileCategory } from "@/lib/api";
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
import { PriceRangeSlider } from "./PriceRangeSlider";

export interface CatalogFilters {
  q?: string;
  category?: string;
  subcategory?: string;
  qualities?: string[];
  season?: string;
  countries?: string[];
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
const DEFAULT_PRICE_BOUNDS: [number, number] = [0, 100];

/**
 * Counts how many "active" filters there are — useful for showing a small
 * badge over the filter button on the catalog screen.
 */
export function countActiveFilters(filters: CatalogFilters): number {
  let n = 0;
  if (filters.q && filters.q.trim()) n++;
  if (filters.category) n++;
  if (filters.subcategory) n++;
  if (filters.qualities && filters.qualities.length > 0) n++;
  if (filters.season) n++;
  if (filters.countries && filters.countries.length > 0) n++;
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

  // Categories — fetched once per sheet open. Subcategories re-fetch when the
  // selected top-level category changes.
  const [categories, setCategories] = useState<MobileCategory[]>([]);
  const [subcategories, setSubcategories] = useState<MobileCategory[]>([]);

  // Price slider bounds (real DB min/max). Cached per session.
  const [priceBounds, setPriceBounds] =
    useState<[number, number]>(DEFAULT_PRICE_BOUNDS);
  const priceBoundsLoadedRef = useRef(false);

  const [priceValues, setPriceValues] = useState<[number, number]>([
    initialFilters.priceMin ?? DEFAULT_PRICE_BOUNDS[0],
    initialFilters.priceMax ?? DEFAULT_PRICE_BOUNDS[1],
  ]);

  // Snapshot of the initial filters on open so we can detect "dirty" state for
  // the discard-warning Alert.
  const initialSnapshotRef = useRef<string>("");

  // Re-sync when sheet re-opens with new external filters
  useEffect(() => {
    if (visible) {
      setDraft(initialFilters);
      setPriceValues([
        initialFilters.priceMin ?? priceBounds[0],
        initialFilters.priceMax ?? priceBounds[1],
      ]);
      initialSnapshotRef.current = JSON.stringify({
        ...initialFilters,
        priceMin: initialFilters.priceMin,
        priceMax: initialFilters.priceMax,
      });
    }
  }, [visible, initialFilters, priceBounds]);

  // Load top-level categories on first open. Cached after that for the lifetime
  // of the screen — categories rarely change.
  useEffect(() => {
    if (!visible || categories.length > 0) return;
    let cancelled = false;
    categoriesApi
      .list()
      .then((res) => {
        if (!cancelled) setCategories(res.categories);
      })
      .catch(() => {
        // Soft fail — sheet still works without category picker.
      });
    return () => {
      cancelled = true;
    };
  }, [visible, categories.length]);

  // Load price bounds once per session.
  useEffect(() => {
    if (!visible || priceBoundsLoadedRef.current) return;
    priceBoundsLoadedRef.current = true;
    let cancelled = false;
    catalogApi
      .priceRange()
      .then((res) => {
        if (cancelled) return;
        const next: [number, number] = [res.min, res.max];
        setPriceBounds(next);
        setPriceValues((prev) => {
          const lo = initialFilters.priceMin ?? next[0];
          const hi = initialFilters.priceMax ?? next[1];
          if (prev[0] === lo && prev[1] === hi) return prev;
          return [lo, hi];
        });
      })
      .catch(() => {
        // Keep defaults — slider still usable with 0..100.
      });
    return () => {
      cancelled = true;
    };
  }, [visible, initialFilters.priceMin, initialFilters.priceMax]);

  // Load subcategories whenever the top-level category changes.
  useEffect(() => {
    if (!draft.category) {
      setSubcategories([]);
      return;
    }
    let cancelled = false;
    categoriesApi
      .subcategories(draft.category)
      .then((res) => {
        if (!cancelled) setSubcategories(res.categories);
      })
      .catch(() => {
        if (!cancelled) setSubcategories([]);
      });
    return () => {
      cancelled = true;
    };
  }, [draft.category]);

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

  const toggleListValue = (key: "qualities" | "countries", value: string) => {
    setDraft((prev) => {
      const current = prev[key] ?? [];
      const next = current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value];
      return { ...prev, [key]: next.length > 0 ? next : undefined };
    });
  };

  const selectCategory = (slug: string) => {
    setDraft((prev) => {
      // Toggle off → clear subcategory too
      if (prev.category === slug) {
        return { ...prev, category: undefined, subcategory: undefined };
      }
      // Switch top-level → reset subcategory so we don't keep a stale slug.
      return { ...prev, category: slug, subcategory: undefined };
    });
  };

  const handleApply = () => {
    const finalFilters: CatalogFilters = { ...draft };
    // Only persist priceMin/Max when they differ from the real DB bounds —
    // otherwise the URL stays clean.
    finalFilters.priceMin =
      priceValues[0] > priceBounds[0] ? priceValues[0] : undefined;
    finalFilters.priceMax =
      priceValues[1] < priceBounds[1] ? priceValues[1] : undefined;
    onApply(finalFilters);
    onClose();
  };

  const handleResetAll = () => {
    setDraft(EMPTY_FILTERS);
    setPriceValues(priceBounds);
  };

  const draftSnapshot = JSON.stringify({
    ...draft,
    priceMin: priceValues[0] > priceBounds[0] ? priceValues[0] : undefined,
    priceMax: priceValues[1] < priceBounds[1] ? priceValues[1] : undefined,
  });
  const isDirty = draftSnapshot !== initialSnapshotRef.current;

  // Backdrop tap / Android back button. If the user has unsaved changes, ask
  // before discarding.
  const handleCloseAttempt = () => {
    if (!isDirty) {
      onClose();
      return;
    }
    Alert.alert("Скасувати фільтри?", "Ваші зміни не будуть застосовані.", [
      { text: "Назад", style: "cancel" },
      { text: "Так, скасувати", style: "destructive", onPress: onClose },
    ]);
  };

  const hasAnyFilter =
    countActiveFilters({
      ...draft,
      priceMin: priceValues[0] > priceBounds[0] ? priceValues[0] : undefined,
      priceMax: priceValues[1] < priceBounds[1] ? priceValues[1] : undefined,
    }) > 0;

  const selectedQualities = draft.qualities ?? [];
  const selectedCountries = draft.countries ?? [];

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={handleCloseAttempt}
    >
      {/* Backdrop — taps prompt for confirmation if dirty, otherwise close. */}
      <Pressable style={styles.backdrop} onPress={handleCloseAttempt} />

      <View style={styles.sheet}>
        {/* Drag handle */}
        <View style={styles.handle} />

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Фільтри</Text>
          <TouchableOpacity
            onPress={handleCloseAttempt}
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

          {/* Category */}
          {categories.length > 0 && (
            <View style={styles.field}>
              <Text style={styles.label}>Категорія</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chipRow}
              >
                {categories.map((c) => (
                  <Chip
                    key={c.id}
                    label={c.name}
                    active={draft.category === c.slug}
                    onPress={() => selectCategory(c.slug)}
                  />
                ))}
              </ScrollView>
            </View>
          )}

          {/* Subcategory — only when a top-level is picked and it has children */}
          {draft.category && subcategories.length > 0 && (
            <View style={styles.field}>
              <Text style={styles.label}>Підкатегорія</Text>
              <View style={styles.chipRowWrap}>
                {subcategories.map((s) => (
                  <Chip
                    key={s.id}
                    label={s.name}
                    active={draft.subcategory === s.slug}
                    onPress={() => toggle("subcategory", s.slug)}
                  />
                ))}
              </View>
            </View>
          )}

          {/* Quality — multi-select */}
          <View style={styles.field}>
            <Text style={styles.label}>Якість</Text>
            {QUALITY_LEVELS.map((q) => {
              const checked = selectedQualities.includes(q);
              return (
                <Pressable
                  key={q}
                  style={styles.checkboxRow}
                  onPress={() => toggleListValue("qualities", q)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked }}
                >
                  <Ionicons
                    name={checked ? "checkbox" : "square-outline"}
                    size={22}
                    color={checked ? "#16a34a" : "#9ca3af"}
                  />
                  <Text style={styles.checkboxLabel}>
                    {QUALITY_LABELS[q] ?? q}
                  </Text>
                </Pressable>
              );
            })}
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

          {/* Country — multi-select */}
          <View style={styles.field}>
            <Text style={styles.label}>Країна</Text>
            {COUNTRIES.map((c) => {
              const checked = selectedCountries.includes(c);
              return (
                <Pressable
                  key={c}
                  style={styles.checkboxRow}
                  onPress={() => toggleListValue("countries", c)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked }}
                >
                  <Ionicons
                    name={checked ? "checkbox" : "square-outline"}
                    size={22}
                    color={checked ? "#16a34a" : "#9ca3af"}
                  />
                  <Text style={styles.checkboxLabel}>
                    {COUNTRY_SHORT[c] ?? c.toUpperCase()}{" "}
                    {COUNTRY_LABELS[c] ?? c}
                  </Text>
                </Pressable>
              );
            })}
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

          {/* Price range slider */}
          <View style={styles.field}>
            <Text style={styles.label}>Ціна (EUR)</Text>
            <PriceRangeSlider
              min={priceBounds[0]}
              max={priceBounds[1]}
              values={priceValues}
              onChange={setPriceValues}
            />
          </View>

          {/* In stock */}
          <TouchableOpacity
            style={styles.inStockRow}
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
  checkboxRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 6,
  },
  inStockRow: {
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
