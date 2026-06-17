import { describe, it, expect } from "vitest";
import {
  DICTIONARIES,
  REGISTERS,
  REPORTS,
  type RegistryStatus,
} from "./registry-catalog";

const VALID_STATUSES: RegistryStatus[] = ["ready", "partial", "todo"];

describe("registry-catalog", () => {
  it("усі href мають валідний формат (/manager/... або null)", () => {
    const hrefs = [
      ...DICTIONARIES.map((d) => d.href),
      ...REGISTERS.map((r) => r.href),
      ...REPORTS.map((r) => r.href),
    ];
    for (const href of hrefs) {
      if (href !== null) {
        expect(href.startsWith("/manager/")).toBe(true);
      }
    }
  });

  it("звіти завжди мають href (всі клікабельні)", () => {
    for (const r of REPORTS) {
      expect(typeof r.href).toBe("string");
      expect(r.href.startsWith("/manager/")).toBe(true);
    }
  });

  it("ключі унікальні в межах кожного масиву", () => {
    const dictKeys = DICTIONARIES.map((d) => d.key);
    const regKeys = REGISTERS.map((r) => r.key);
    const repKeys = REPORTS.map((r) => r.key);
    expect(new Set(dictKeys).size).toBe(dictKeys.length);
    expect(new Set(regKeys).size).toBe(regKeys.length);
    expect(new Set(repKeys).size).toBe(repKeys.length);
  });

  it("статуси належать до дозволеного enum", () => {
    for (const d of DICTIONARIES) {
      expect(VALID_STATUSES).toContain(d.status);
    }
    for (const r of REGISTERS) {
      expect(VALID_STATUSES).toContain(r.status);
    }
  });

  it("регістр боргу — ready, balance, з живим href", () => {
    const debt = REGISTERS.find((r) => r.key === "debt");
    expect(debt).toBeDefined();
    expect(debt?.status).toBe("ready");
    expect(debt?.type).toBe("balance");
    expect(debt?.href).toBe("/manager/registry/debt");
  });

  it("ready-об'єкти мають href, todo-об'єкти мають фазу", () => {
    for (const d of DICTIONARIES) {
      if (d.status === "ready") expect(d.href).not.toBeNull();
      if (d.status === "todo") expect(typeof d.phase).toBe("number");
    }
    for (const r of REGISTERS) {
      if (r.status === "ready") expect(r.href).not.toBeNull();
      if (r.status === "todo") expect(r.href).toBeNull();
    }
  });
});
