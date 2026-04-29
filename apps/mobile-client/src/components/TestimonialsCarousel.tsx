import React, { useCallback, useRef, useState } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  Dimensions,
  type ListRenderItemInfo,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { TESTIMONIALS, type Testimonial } from "@/lib/testimonials";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const CARD_HORIZONTAL_MARGIN = 16;
const CARD_WIDTH = SCREEN_WIDTH - CARD_HORIZONTAL_MARGIN * 2;

function StarRow({ rating }: { rating: number }) {
  return (
    <View
      style={styles.stars}
      accessibilityLabel={`Оцінка ${rating} з 5`}
      accessibilityRole="text"
    >
      {Array.from({ length: 5 }).map((_, i) => (
        <Ionicons
          key={i}
          name={i < rating ? "star" : "star-outline"}
          size={14}
          color={i < rating ? "#fbbf24" : "#d1d5db"}
        />
      ))}
    </View>
  );
}

function formatDate(date: string): string {
  // ISO date "YYYY-MM-DD" → uk-UA pretty (e.g. "12 берез. 2026")
  try {
    const d = new Date(date);
    if (Number.isNaN(d.getTime())) return date;
    return d.toLocaleDateString("uk-UA", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return date;
  }
}

export function TestimonialsCarousel() {
  const [activeIndex, setActiveIndex] = useState(0);
  const flatListRef = useRef<FlatList<Testimonial>>(null);

  const handleScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const offset = e.nativeEvent.contentOffset.x;
      // Each page is the full screen width (card + its 16px margins).
      const idx = Math.round(offset / SCREEN_WIDTH);
      if (idx !== activeIndex && idx >= 0 && idx < TESTIMONIALS.length) {
        setActiveIndex(idx);
      }
    },
    [activeIndex],
  );

  const renderItem = ({ item }: ListRenderItemInfo<Testimonial>) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <StarRow rating={item.rating} />
        <Text style={styles.date}>{formatDate(item.date)}</Text>
      </View>
      <Text style={styles.text} numberOfLines={6}>
        “{item.text}”
      </Text>
      <Text style={styles.author}>— {item.name}</Text>
    </View>
  );

  if (TESTIMONIALS.length === 0) return null;

  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <Text style={styles.title}>Відгуки клієнтів</Text>
      </View>
      <FlatList
        ref={flatListRef}
        data={TESTIMONIALS}
        keyExtractor={(t) => t.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        decelerationRate="fast"
        renderItem={renderItem}
      />
      {TESTIMONIALS.length > 1 ? (
        <View style={styles.dots}>
          {TESTIMONIALS.map((_, i) => (
            <View
              key={i}
              style={[styles.dot, i === activeIndex && styles.dotActive]}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: 24 },
  header: {
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: "600",
    color: "#111827",
  },
  card: {
    width: CARD_WIDTH,
    marginHorizontal: CARD_HORIZONTAL_MARGIN,
    padding: 16,
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  stars: {
    flexDirection: "row",
    gap: 2,
  },
  date: {
    fontSize: 11,
    color: "#9ca3af",
  },
  text: {
    fontSize: 14,
    color: "#374151",
    lineHeight: 20,
  },
  author: {
    marginTop: 12,
    fontSize: 13,
    fontWeight: "600",
    color: "#111827",
  },
  dots: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
    marginTop: 12,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#d1d5db",
  },
  dotActive: {
    width: 16,
    backgroundColor: "#16a34a",
  },
});
