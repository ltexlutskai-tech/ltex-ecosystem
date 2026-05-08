import { describe, it, expect } from "vitest";
import { GET } from "./route";

describe("GET /api/catalog/numeric-ranges", () => {
  it("returns fixed 1..1000 bounds for both unitsPerKg and unitWeight", async () => {
    const res = await GET();
    const json = await res.json();

    expect(json).toEqual({
      unitsPerKg: { min: 1, max: 1000 },
      unitWeight: { min: 1, max: 1000 },
    });
  });

  it("sends Cache-Control 24h", async () => {
    const res = await GET();
    expect(res.headers.get("Cache-Control")).toContain("max-age=86400");
  });
});
