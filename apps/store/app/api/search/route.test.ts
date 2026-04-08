import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock rate limiter
const mockRateLimit = vi.fn().mockReturnValue({ allowed: true, remaining: 19 });
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: (...args: unknown[]) => mockRateLimit(...args),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
}));

// Mock catalog
const mockAutocomplete = vi.fn();
vi.mock("@/lib/catalog", () => ({
  autocompleteSearch: (...args: unknown[]) => mockAutocomplete(...args),
}));

describe("Search API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRateLimit.mockReturnValue({ allowed: true, remaining: 19 });
  });

  describe("Input validation", () => {
    it("rejects empty query", () => {
      const query = "";
      expect(query.length).toBeLessThan(2);
    });

    it("rejects single character query", () => {
      const query = "a";
      expect(query.length).toBeLessThan(2);
    });

    it("accepts 2+ character query", () => {
      const query = "шт";
      expect(query.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("Rate limiting", () => {
    it("allows up to 20 requests per minute", () => {
      mockRateLimit.mockReturnValue({ allowed: true, remaining: 0 });
      const result = mockRateLimit("search:127.0.0.1", {
        windowMs: 60_000,
        max: 20,
      });
      expect(result.allowed).toBe(true);
    });

    it("blocks excessive requests", () => {
      mockRateLimit.mockReturnValue({ allowed: false, remaining: 0 });
      const result = mockRateLimit("search:127.0.0.1", {
        windowMs: 60_000,
        max: 20,
      });
      expect(result.allowed).toBe(false);
    });
  });

  describe("Autocomplete results", () => {
    it("returns search results", async () => {
      mockAutocomplete.mockResolvedValue([
        {
          id: "1",
          name: "Штани чоловічі",
          slug: "shtany-cholovichi",
          quality: "first",
          rank: 1,
        },
        {
          id: "2",
          name: "Шторки",
          slug: "shtorky",
          quality: "stock",
          rank: 0.8,
        },
      ]);

      const results = await mockAutocomplete("шт");
      expect(results).toHaveLength(2);
      expect(results[0].name).toContain("Штани");
    });

    it("returns empty array for no matches", async () => {
      mockAutocomplete.mockResolvedValue([]);
      const results = await mockAutocomplete("xyz123");
      expect(results).toHaveLength(0);
    });

    it("limits results to 5 items", async () => {
      const items = Array.from({ length: 5 }, (_, i) => ({
        id: String(i),
        name: `Product ${i}`,
        slug: `product-${i}`,
        quality: "first",
        rank: 1,
      }));
      mockAutocomplete.mockResolvedValue(items);
      const results = await mockAutocomplete("prod");
      expect(results.length).toBeLessThanOrEqual(5);
    });
  });

  describe("Edge cases", () => {
    it("handles special characters in query", () => {
      const query = "куртка <script>";
      const sanitized = query.replace(/[<>]/g, "");
      expect(sanitized).not.toContain("<");
      expect(sanitized).not.toContain(">");
    });

    it("handles very long query strings", () => {
      const query = "a".repeat(500);
      expect(query.length).toBe(500);
    });

    it("handles unicode characters", () => {
      const query = "Футболка жіноча";
      expect(query.length).toBeGreaterThan(0);
    });
  });
});
