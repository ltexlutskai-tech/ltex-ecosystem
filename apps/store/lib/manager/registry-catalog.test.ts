import { describe, it, expect } from "vitest";
import {
  DICTIONARIES,
  REGISTERS,
  REPORTS,
  REPORT_THEMES,
  type RegistryStatus,
  type ReportTheme,
} from "./registry-catalog";

const VALID_STATUSES: RegistryStatus[] = ["ready", "partial", "todo"];
const VALID_THEMES: ReportTheme[] = ["sales", "finance", "stock", "debt"];

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

  it("кожен звіт має валідну тему", () => {
    for (const r of REPORTS) {
      expect(VALID_THEMES).toContain(r.theme);
    }
  });

  it("REPORT_THEMES покриває всі теми, що використовуються у звітах", () => {
    const themeKeys = REPORT_THEMES.map((t) => t.key);
    expect(new Set(themeKeys).size).toBe(themeKeys.length);
    for (const r of REPORTS) {
      expect(themeKeys).toContain(r.theme);
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

  it("Фаза 8 — нові регістри присутні, ready, з живими href", () => {
    const phase8 = [
      { key: "stock_norms", href: "/manager/registry/stock-norms" },
      {
        key: "client_status_history",
        href: "/manager/registry/client-status-history",
      },
      { key: "agent_day_log", href: "/manager/registry/agent-day-log" },
    ];
    for (const expected of phase8) {
      const reg = REGISTERS.find((r) => r.key === expected.key);
      expect(reg, `register ${expected.key} present`).toBeDefined();
      expect(reg?.status).toBe("ready");
      expect(reg?.href).toBe(expected.href);
      expect(reg?.phase).toBe(8);
    }
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
