"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

interface SearchResult {
  id: string;
  name: string;
  slug: string;
  quality: string;
}

interface SearchAutocompleteProps {
  defaultValue?: string;
  placeholder?: string;
}

export function SearchAutocomplete({
  defaultValue = "",
  placeholder = "Пошук товарів...",
}: SearchAutocompleteProps) {
  const router = useRouter();
  const [query, setQuery] = useState(defaultValue);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const fetchResults = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setResults([]);
      setIsOpen(false);
      return;
    }
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      if (!res.ok) return;
      const data = await res.json();
      setResults(data.results ?? []);
      setIsOpen((data.results ?? []).length > 0);
      setSelectedIndex(-1);
    } catch {
      // silently fail
    }
  }, []);

  const handleChange = useCallback(
    (value: string) => {
      setQuery(value);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => fetchResults(value), 300);
    },
    [fetchResults],
  );

  const navigateToProduct = useCallback(
    (slug: string) => {
      setIsOpen(false);
      router.push(`/product/${slug}`);
    },
    [router],
  );

  const navigateToCatalog = useCallback(() => {
    setIsOpen(false);
    if (query.trim()) {
      router.push(`/catalog?q=${encodeURIComponent(query.trim())}`);
    }
  }, [router, query]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!isOpen) {
        if (e.key === "Enter") {
          navigateToCatalog();
        }
        return;
      }

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex((prev) =>
            prev < results.length - 1 ? prev + 1 : prev,
          );
          break;
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex((prev) => (prev > 0 ? prev - 1 : -1));
          break;
        case "Enter":
          e.preventDefault();
          if (
            selectedIndex >= 0 &&
            selectedIndex < results.length &&
            results[selectedIndex]
          ) {
            navigateToProduct(results[selectedIndex].slug);
          } else {
            navigateToCatalog();
          }
          break;
        case "Escape":
          setIsOpen(false);
          break;
      }
    },
    [isOpen, results, selectedIndex, navigateToProduct, navigateToCatalog],
  );

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Cleanup debounce
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const qualityLabels: Record<string, string> = {
    extra: "Екстра",
    cream: "Крем",
    first: "1й сорт",
    second: "2й сорт",
    stock: "Сток",
    mix: "Мікс",
  };

  return (
    <div ref={containerRef} className="relative w-full">
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => handleChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => results.length > 0 && setIsOpen(true)}
        placeholder={placeholder}
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-autocomplete="list"
        aria-expanded={isOpen}
        role="combobox"
        data-analytics="search-submit"
      />

      {isOpen && results.length > 0 && (
        <ul
          className="absolute left-0 right-0 top-full z-50 mt-1 max-h-60 overflow-auto rounded-md border bg-background shadow-lg"
          role="listbox"
        >
          {results.map((result, index) => (
            <li
              key={result.id}
              role="option"
              aria-selected={index === selectedIndex}
              className={`flex cursor-pointer items-center justify-between px-3 py-2 text-sm ${
                index === selectedIndex ? "bg-accent/20" : "hover:bg-muted"
              }`}
              onMouseDown={() => navigateToProduct(result.slug)}
              onMouseEnter={() => setSelectedIndex(index)}
            >
              <span>{result.name}</span>
              <span className="ml-2 text-xs text-muted-foreground">
                {qualityLabels[result.quality] ?? result.quality}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
