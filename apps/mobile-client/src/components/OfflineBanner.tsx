import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet, AppState } from "react-native";
import { Ionicons } from "@expo/vector-icons";

/**
 * Shows a banner at the top of the screen when the device has no network connectivity.
 * Uses fetch-based check since @react-native-community/netinfo may not be installed.
 */
export function OfflineBanner() {
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function checkConnection() {
      try {
        // Simple connectivity check — ping the API with a short timeout
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        await fetch("https://clients3.google.com/generate_204", {
          method: "HEAD",
          signal: controller.signal,
        });
        clearTimeout(timeout);
        if (mounted) setIsOffline(false);
      } catch {
        if (mounted) setIsOffline(true);
      }
    }

    checkConnection();

    // Re-check when app comes to foreground
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        checkConnection();
      }
    });

    // Periodic check every 15 seconds when offline
    const interval = setInterval(() => {
      if (isOffline) {
        checkConnection();
      }
    }, 15000);

    return () => {
      mounted = false;
      subscription.remove();
      clearInterval(interval);
    };
  }, [isOffline]);

  if (!isOffline) return null;

  return (
    <View style={styles.banner}>
      <Ionicons name="cloud-offline-outline" size={16} color="#fff" />
      <Text style={styles.text}>Немає з'єднання з інтернетом</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#dc2626",
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  text: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
  },
});
