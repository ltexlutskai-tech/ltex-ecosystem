import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Image,
  FlatList,
  Pressable,
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
const HORIZONTAL_PADDING = 16;
const SLIDE_WIDTH = SCREEN_WIDTH - HORIZONTAL_PADDING * 2;
// 16:9 aspect ratio — банер фотовую ширину контейнера, висота — наслідок.
const SLIDE_HEIGHT = Math.round((SLIDE_WIDTH * 9) / 16);
const AUTO_ROTATE_MS = 6000;
const WEB_BASE_URL = "https://new.ltex.com.ua";

interface BannerCarouselProps {
  banners: MobileHomeBanner[];
}

/**
 * Routes a banner CTA. Internal `/catalog` paths jump to the Catalog tab,
 * `/product/{slug}` and other in-app paths fall back to opening the full
 * web URL because the in-app ProductDetail screen requires productId+name
 * which are not available from a banner href alone. External http(s)
 * links open in the system browser.
 */
function useBannerNavigator() {
  const navigation = useNavigation<NativeStackNavigationProp<any>>();
  return useCallback(
    (href: string) => {
      if (!href) return;
      if (href.startsWith("http://") || href.startsWith("https://")) {
        Linking.openURL(href).catch(() => {});
        return;
      }
      // Internal route handling (MVP: only /catalog has a 1:1 mapping).
      const path = href.startsWith("/") ? href.slice(1) : href;
      if (path === "" || path === "catalog") {
        navigation.navigate("Catalog");
        return;
      }
      // Anything else (`/product/...`, `/lots`, etc.) — open via web fallback.
      Linking.openURL(
        `${WEB_BASE_URL}${href.startsWith("/") ? href : `/${href}`}`,
      ).catch(() => {});
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
      <Pressable
        style={styles.slide}
        onPress={() => navigateBanner(item.ctaHref ?? "")}
      >
        <Image
          source={{ uri: item.imageUrl }}
          style={styles.image}
          resizeMode="cover"
        />
      </Pressable>
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: HORIZONTAL_PADDING,
    marginTop: 16,
    height: SLIDE_HEIGHT,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "#e5e7eb",
  },
  slide: {
    width: SLIDE_WIDTH,
    height: SLIDE_HEIGHT,
  },
  image: {
    width: "100%",
    height: "100%",
  },
});
