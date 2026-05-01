import React, { useEffect } from "react";
import { ScrollView, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Font from "expo-font";
import { StatusBar } from "expo-status-bar";
import { AppNavigator } from "@/navigation/AppNavigator";

interface ErrorBoundaryState {
  error: Error | null;
}

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("App error:", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <ScrollView
          style={{ flex: 1, backgroundColor: "#fff", padding: 16 }}
          contentContainerStyle={{ paddingTop: 60 }}
        >
          <Text style={{ color: "#dc2626", fontSize: 18, fontWeight: "700" }}>
            App crashed
          </Text>
          <Text style={{ color: "#111", marginTop: 8, fontSize: 14 }}>
            {this.state.error.message}
          </Text>
          <Text
            style={{
              color: "#666",
              marginTop: 16,
              fontSize: 11,
              fontFamily: "monospace",
            }}
          >
            {this.state.error.stack ?? ""}
          </Text>
        </ScrollView>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  useEffect(() => {
    Font.loadAsync(Ionicons.font).catch(() => {});
  }, []);

  return (
    <View style={{ flex: 1 }}>
      <StatusBar style="dark" />
      <ErrorBoundary>
        <AppNavigator />
      </ErrorBoundary>
    </View>
  );
}
