import { describe, it, expect } from "vitest";
import {
  UA_REGIONS,
  UA_REGION_SLUGS,
  getRegionLabel,
  isValidRegionSlug,
} from "./regions";

describe("UA_REGIONS", () => {
  it("contains exactly 24 oblasti (без м.Київ/Севастополь/АР Крим)", () => {
    expect(UA_REGIONS).toHaveLength(24);
    expect(UA_REGION_SLUGS).toHaveLength(24);
  });

  it("all slugs are unique", () => {
    const slugs = UA_REGIONS.map((r) => r.slug);
    expect(new Set(slugs).size).toBe(24);
  });

  it("all labels look like прикметник (ська/цька/зька)", () => {
    for (const r of UA_REGIONS) {
      expect(r.label).toMatch(/(с|ц|з)ька$/);
    }
  });

  it("includes Волинську (домашня область L-TEX)", () => {
    const volyn = UA_REGIONS.find((r) => r.slug === "volynska");
    expect(volyn).toBeDefined();
    expect(volyn?.label).toBe("Волинська");
  });
});

describe("getRegionLabel", () => {
  it("returns label for valid slug", () => {
    expect(getRegionLabel("volynska")).toBe("Волинська");
    expect(getRegionLabel("ivano-frankivska")).toBe("Івано-Франківська");
  });

  it("returns null for invalid slug", () => {
    expect(getRegionLabel("nope")).toBeNull();
    expect(getRegionLabel("")).toBeNull();
    expect(getRegionLabel("kyiv-city")).toBeNull(); // ми не маємо м.Київ
  });
});

describe("isValidRegionSlug", () => {
  it("returns true for valid slugs", () => {
    expect(isValidRegionSlug("volynska")).toBe(true);
    expect(isValidRegionSlug("kyivska")).toBe(true);
  });

  it("returns false for invalid slugs", () => {
    expect(isValidRegionSlug("nope")).toBe(false);
    expect(isValidRegionSlug("")).toBe(false);
    expect(isValidRegionSlug("VOLYNSKA")).toBe(false); // case-sensitive
  });
});
