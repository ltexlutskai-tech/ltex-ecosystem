import { describe, it, expect } from "vitest";
import { canManageCatalog } from "./catalog-permissions";

describe("canManageCatalog (7.2 Block 3, decision 1A)", () => {
  it("allows admin / owner / warehouse", () => {
    expect(canManageCatalog("admin")).toBe(true);
    expect(canManageCatalog("owner")).toBe(true);
    expect(canManageCatalog("warehouse")).toBe(true);
  });

  it("denies other roles", () => {
    expect(canManageCatalog("manager")).toBe(false);
    expect(canManageCatalog("senior_manager")).toBe(false);
    expect(canManageCatalog("analyst")).toBe(false);
    expect(canManageCatalog("supervisor")).toBe(false);
    expect(canManageCatalog("expeditor")).toBe(false);
    expect(canManageCatalog("bookkeeper")).toBe(false);
  });
});
