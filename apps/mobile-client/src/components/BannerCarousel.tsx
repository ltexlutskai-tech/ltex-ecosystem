import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  Image,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Linking,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ListRenderItemInfo,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { MobileHomeBanner } from "@/lib/api";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const BANNER_HEIGHT = 180;
const HORIZONTAL_PADDING = 16;
const SLIDE_WIDTH = SCREEN_WIDTH - HORIZONTAL_PADDING * 2;
const AUTO_ROTATE_MS = 6000;

interface BannerCarouselProps {
  banners: MobileHomeBanner[];
}

/**
 * Routes a banner CTA. http(s) urls open in the system browser, ltex:// deep
 * links go through Linking too (caught by the linking config), and a few
 * common in-app destinations are translated to navigation.navigate.
 */
function useBannerNavigator() {
  const navigation = useNavigation<NativeStackNavigationProp<any>>();
  return useCallback(
    (href: string | null) => {
      if (!href) return;
      if (href.startsWith("http://") || href.startsWith("https://")) {
        Linking.openURL(href).catch(() => {});
        return;
      }
      // Bare in-app paths from /admin/banners (e.g. "/catalog", "/lots").
      const path = href.startsWith("/") ? href.slice(1) : href;
      if (path === "" || path === "catalog") {
        navigation.navigate("Catalog");
      } else if (path === "lots") {
        navigation.navigate("Lots");
      } else if (path === "wishlist") {
        navigation.navigate("Wishlist");
      } else {
        // Fall through to deep link handler.
        Linking.openURL(href).catch(() => {});
      }
    },
    [navigation],
  );
}

export function BannerCarousel({ banners }: BannerCarouselProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const listRef = useRef<FlatList<MobileHomeBanner>>(null);
  const navigateBanner = useBannerNavigator();

  // Auto-rotate. Each manual swipe resets the timer because the effect
  // depends on activeIndex and re-runs.
  useEffect(() => {
    if (banners.length <= 1) return;
    const id = setTimeout(() => {
      const next = (activeIndex + 1) % banners.length;
      listRef.current?.scrollToIndex({ index: next, animated: true });
      setActiveIndex(next);
    }, AUTO_ROTATE_MS);
    return () => clearTimeout(id);
  }, [activeIndex, banners.length]);

  const onMomentumEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const idx = Math.round(e.nativeEvent.contentOffset.x / SLIDE_WIDTH);
      if (idx !== activeIndex) setActiveIndex(idx);
    },
    [activeIndex],
  );

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<MobileHomeBanner>) => (
      <TouchableOpacity
        style={styles.slide}
        activeOpacity={0.9}
        onPress={() => navigateBanner(item.ctaHref)}
      >
        <Image
          source={{ uri: item.imageUrl }}
          style={styles.image}
          resizeMode="cover"
        />
        <View style={styles.overlay} />
        <View style={styles.textBlock}>
          <Text style={styles.title} numberOfLines={2}>
            {item.title}
          </Text>
          {item.subtitle ? (
            <Text style={styles.subtitle} numberOfLines={2}>
              {item.subtitle}
            </Text>
          ) : null}
          {item.ctaLabel ? (
            <View style={styles.ctaPill}>
              <Text style={styles.ctaText}>{item.ctaLabel}</Text>
            </View>
          ) : null}
        </View>
      </TouchableOpacity>
    ),
    [navigateBanner],
  );

  if (banners.length === 0) return null;

  return (
    <View style={styles.container}>
      <FlatList
        ref={listRef}
        data={banners}
        keyExtractor={(b) => b.id}
        renderItem={renderItem}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        snapToInterval={SLIDE_WIDTH}
        decelerationRate="fast"
        onMomentumScrollEnd={onMomentumEnd}
        getItemLayout={(_, index) => ({
          length: SLIDE_WIDTH,
          offset: SLIDE_WIDTH * index,
          index,
        })}
      />
      {banners.length > 1 ? (
        <View style={styles.dotsRow}>
          {banners.map((_, i) => (
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
  container: {
    marginHorizontal: HORIZONTAL_PADDING,
    marginTop: 16,
    height: BANNER_HEIGHT,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "#e5e7eb",
  },
  slide: {
    width: SLIDE_WIDTH,
    height: BANNER_HEIGHT,
    position: "relative",
  },
  image: {
    width: "100%",
    height: "100%",
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  textBlock: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 18,
    gap: 6,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: "#fff",
  },
  subtitle: {
    fontSize: 13,
    color: "rgba(255,255,255,0.92)",
  },
  ctaPill: {
    alignSelf: "flex-start",
    marginTop: 6,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: "#16a34a",
  },
  ctaText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
  },
  dotsRow: {
    position: "absolute",
    bottom: 6,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "center",
    gap: 4,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.6)",
  },
  dotActive: {
    backgroundColor: "#fff",
    width: 12,
  },
});
