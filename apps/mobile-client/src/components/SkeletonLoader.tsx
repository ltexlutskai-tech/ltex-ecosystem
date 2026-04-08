import React, { useEffect, useRef } from "react";
import { View, Animated, StyleSheet, type ViewStyle } from "react-native";

interface SkeletonBoxProps {
  width?: number | string;
  height?: number;
  borderRadius?: number;
  style?: ViewStyle;
}

function SkeletonBox({
  width = "100%",
  height = 16,
  borderRadius = 6,
  style,
}: SkeletonBoxProps) {
  const opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.3,
          duration: 800,
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        {
          width: width as number,
          height,
          borderRadius,
          backgroundColor: "#e5e7eb",
          opacity,
        },
        style,
      ]}
    />
  );
}

export function CatalogSkeleton() {
  return (
    <View style={skeletonStyles.container}>
      {/* Search bar skeleton */}
      <View style={skeletonStyles.searchBar}>
        <SkeletonBox height={42} borderRadius={10} />
      </View>
      {/* Filter chips skeleton */}
      <View style={skeletonStyles.chipsRow}>
        {[60, 70, 80, 65, 55, 60].map((w, i) => (
          <SkeletonBox key={i} width={w} height={32} borderRadius={20} />
        ))}
      </View>
      {/* Product cards skeleton */}
      {[1, 2, 3, 4].map((i) => (
        <View key={i} style={skeletonStyles.productCard}>
          <SkeletonBox width={80} height={80} borderRadius={10} />
          <View style={skeletonStyles.productInfo}>
            <SkeletonBox width="75%" height={16} />
            <SkeletonBox width="50%" height={14} style={{ marginTop: 8 }} />
            <SkeletonBox width="30%" height={14} style={{ marginTop: 8 }} />
          </View>
        </View>
      ))}
    </View>
  );
}

export function OrdersSkeleton() {
  return (
    <View style={skeletonStyles.listContainer}>
      {[1, 2, 3].map((i) => (
        <View key={i} style={skeletonStyles.card}>
          <View style={skeletonStyles.cardRow}>
            <SkeletonBox width="40%" height={16} />
            <SkeletonBox width="25%" height={14} />
          </View>
          <SkeletonBox
            width={90}
            height={24}
            borderRadius={6}
            style={{ marginTop: 8 }}
          />
          <View style={[skeletonStyles.cardRow, { marginTop: 14 }]}>
            <SkeletonBox width="28%" height={14} />
            <SkeletonBox width="28%" height={14} />
            <SkeletonBox width="28%" height={14} />
          </View>
        </View>
      ))}
    </View>
  );
}

export function ShipmentsSkeleton() {
  return (
    <View style={skeletonStyles.listContainer}>
      {[1, 2, 3].map((i) => (
        <View key={i} style={skeletonStyles.card}>
          <View style={skeletonStyles.cardRow}>
            <SkeletonBox width={120} height={14} />
            <SkeletonBox width={80} height={22} borderRadius={6} />
          </View>
          <SkeletonBox
            width="60%"
            height={20}
            style={{ marginTop: 10 }}
          />
          <View style={{ gap: 6, marginTop: 12 }}>
            <SkeletonBox width="100%" height={14} />
            <SkeletonBox width="80%" height={14} />
            <SkeletonBox width="70%" height={14} />
          </View>
          <View style={[skeletonStyles.cardRow, { marginTop: 14 }]}>
            <SkeletonBox width="45%" height={38} borderRadius={8} />
            <SkeletonBox width="45%" height={38} borderRadius={8} />
          </View>
        </View>
      ))}
    </View>
  );
}

export function ChatSkeleton() {
  return (
    <View style={skeletonStyles.chatContainer}>
      {/* Header */}
      <View style={skeletonStyles.chatHeader}>
        <SkeletonBox width={8} height={8} borderRadius={4} />
        <SkeletonBox width={180} height={14} />
      </View>
      {/* Messages */}
      <View style={skeletonStyles.chatMessages}>
        <View style={skeletonStyles.msgRight}>
          <SkeletonBox width={200} height={40} borderRadius={16} />
        </View>
        <View style={skeletonStyles.msgLeft}>
          <SkeletonBox width={240} height={56} borderRadius={16} />
        </View>
        <View style={skeletonStyles.msgRight}>
          <SkeletonBox width={160} height={40} borderRadius={16} />
        </View>
        <View style={skeletonStyles.msgLeft}>
          <SkeletonBox width={180} height={40} borderRadius={16} />
        </View>
      </View>
      {/* Input bar */}
      <View style={skeletonStyles.chatInput}>
        <SkeletonBox height={40} borderRadius={20} style={{ flex: 1 }} />
        <SkeletonBox width={40} height={40} borderRadius={20} />
      </View>
    </View>
  );
}

export function ProductSkeleton() {
  return (
    <View style={skeletonStyles.container}>
      <SkeletonBox width="100%" height={260} borderRadius={0} />
      <View style={{ padding: 16, gap: 12 }}>
        <SkeletonBox width="80%" height={22} />
        <View style={{ flexDirection: "row", gap: 6 }}>
          <SkeletonBox width={70} height={24} borderRadius={6} />
          <SkeletonBox width={70} height={24} borderRadius={6} />
          <SkeletonBox width={70} height={24} borderRadius={6} />
        </View>
        <SkeletonBox width="40%" height={26} />
        <SkeletonBox width="100%" height={60} />
        <SkeletonBox width="100%" height={42} borderRadius={10} />
        <SkeletonBox width="50%" height={18} style={{ marginTop: 8 }} />
        {[1, 2, 3].map((i) => (
          <SkeletonBox
            key={i}
            width="100%"
            height={64}
            borderRadius={10}
          />
        ))}
      </View>
    </View>
  );
}

export function ProfileSkeleton() {
  return (
    <View style={skeletonStyles.container}>
      {/* Header */}
      <View style={skeletonStyles.profileHeader}>
        <SkeletonBox width={72} height={72} borderRadius={36} />
        <SkeletonBox
          width={140}
          height={20}
          style={{ marginTop: 12 }}
        />
        <SkeletonBox
          width={120}
          height={14}
          style={{ marginTop: 6 }}
        />
      </View>
      {/* Stats */}
      <View style={skeletonStyles.statsRow}>
        {[1, 2, 3].map((i) => (
          <View key={i} style={skeletonStyles.statBox}>
            <SkeletonBox width={50} height={22} />
            <SkeletonBox
              width={60}
              height={12}
              style={{ marginTop: 6 }}
            />
          </View>
        ))}
      </View>
      {/* Info card */}
      <View style={skeletonStyles.profileSection}>
        {[1, 2, 3, 4, 5].map((i) => (
          <View key={i} style={skeletonStyles.infoRow}>
            <SkeletonBox width={18} height={18} borderRadius={9} />
            <View style={{ flex: 1, gap: 4 }}>
              <SkeletonBox width="30%" height={10} />
              <SkeletonBox width="60%" height={14} />
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

const skeletonStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f9fafb",
  },
  searchBar: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  chipsRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 8,
  },
  productCard: {
    flexDirection: "row",
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 12,
    marginHorizontal: 16,
    marginBottom: 10,
    gap: 12,
  },
  productInfo: {
    flex: 1,
    justifyContent: "center",
  },
  listContainer: {
    padding: 16,
    gap: 10,
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
  },
  cardRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  // Chat
  chatContainer: {
    flex: 1,
    backgroundColor: "#f3f4f6",
  },
  chatHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  chatMessages: {
    flex: 1,
    padding: 12,
    justifyContent: "flex-end",
    gap: 10,
  },
  msgRight: {
    alignSelf: "flex-end",
  },
  msgLeft: {
    alignSelf: "flex-start",
  },
  chatInput: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
  },
  // Profile
  profileHeader: {
    alignItems: "center",
    paddingTop: 24,
    paddingBottom: 20,
    backgroundColor: "#fff",
  },
  statsRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 10,
  },
  statBox: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 14,
    alignItems: "center",
  },
  profileSection: {
    marginHorizontal: 16,
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
});
