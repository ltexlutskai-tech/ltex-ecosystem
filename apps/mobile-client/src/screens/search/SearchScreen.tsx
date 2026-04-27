import React from "react";
import { View, TextInput, FlatList, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRoute } from "@react-navigation/native";

interface SearchResult {
  id: string;
  name: string;
  slug: string;
}

export function SearchScreen() {
  const route = useRoute();
  const initialQ = (route.params as { q?: string } | undefined)?.q ?? "";
  const [query, setQuery] = React.useState(initialQ);
  const [results, setResults] = React.useState<SearchResult[]>([]);

  const doSearch = React.useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([]);
      return;
    }
    try {
      const res = await fetch(
        `${process.env.EXPO_PUBLIC_API_URL ?? "https://new.ltex.com.ua/api"}/search?q=${encodeURIComponent(q)}`,
      );
      if (!res.ok) return;
      const data = await res.json();
      setResults(data.products ?? []);
    } catch {
      // Silently fail in MVP; S34 will add proper error UI.
    }
  }, []);

  React.useEffect(() => {
    if (initialQ) {
      void doSearch(initialQ);
    }
  }, [initialQ, doSearch]);

  return (
    <View style={styles.container}>
      <View style={styles.searchWrap}>
        <Ionicons name="search-outline" size={20} color="#9ca3af" />
        <TextInput
          style={styles.input}
          value={query}
          onChangeText={setQuery}
          placeholder="Пошук товарів..."
          placeholderTextColor="#9ca3af"
          autoFocus
          returnKeyType="search"
          onSubmitEditing={() => doSearch(query)}
        />
      </View>

      {results.length === 0 ? (
        <Text style={styles.emptyText}>
          {query ? "Нічого не знайдено" : "Введіть запит для пошуку"}
        </Text>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <Text style={styles.rowTitle}>{item.name}</Text>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f9fafb" },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    margin: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    gap: 8,
  },
  input: { flex: 1, fontSize: 15, color: "#111827" },
  emptyText: {
    textAlign: "center",
    color: "#9ca3af",
    marginTop: 32,
    fontSize: 14,
  },
  row: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  rowTitle: { fontSize: 15, color: "#111827" },
});
