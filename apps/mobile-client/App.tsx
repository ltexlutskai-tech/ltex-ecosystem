import { useEffect, useState } from "react";
import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Font from "expo-font";
import { StatusBar } from "expo-status-bar";
import { AppNavigator } from "@/navigation/AppNavigator";

const FONT_LOAD_TIMEOUT_MS = 3000;

export default function App() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let done = false;
    const proceed = () => {
      if (done) return;
      done = true;
      setReady(true);
    };
    Font.loadAsync(Ionicons.font).then(proceed).catch(proceed);
    const timer = setTimeout(proceed, FONT_LOAD_TIMEOUT_MS);
    return () => {
      done = true;
      clearTimeout(timer);
    };
  }, []);

  if (!ready) return null;

  return (
    <View style={{ flex: 1 }}>
      <StatusBar style="dark" />
      <AppNavigator />
    </View>
  );
}
