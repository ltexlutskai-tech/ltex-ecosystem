import { describe, expect, it } from "vitest";
import {
  financeAvailableFor,
  getDefaultDashboard,
  getWidgetDef,
  sanitizeDashboardConfig,
} from "./dashboard-widgets";

describe("dashboard-widgets — реєстр віджетів робочого столу", () => {
  it("finance доступний лише owner/admin", () => {
    expect(financeAvailableFor("owner")).toBe(true);
    expect(financeAvailableFor("admin")).toBe(true);
    expect(financeAvailableFor("manager")).toBe(false);
    expect(financeAvailableFor("warehouse")).toBe(false);
  });

  it("дефолт owner містить фінансові віджети", () => {
    const cfg = getDefaultDashboard("owner");
    const types = cfg.widgets.map((w) => w.type);
    expect(types).toContain("fin-revenue");
    expect(types).toContain("fin-chart");
    expect(types).toContain("greeting");
  });

  it("дефолт manager без фінансових віджетів", () => {
    const cfg = getDefaultDashboard("manager");
    const types = cfg.widgets.map((w) => w.type);
    expect(types).not.toContain("fin-revenue");
    expect(types).toContain("tiles");
    expect(types).toContain("my-clients");
  });

  it("невідомий вхід → дефолт за роллю", () => {
    expect(sanitizeDashboardConfig(null, "manager")).toEqual(
      getDefaultDashboard("manager"),
    );
    expect(sanitizeDashboardConfig("junk", "owner")).toEqual(
      getDefaultDashboard("owner"),
    );
    expect(sanitizeDashboardConfig({ widgets: [] }, "manager")).toEqual(
      getDefaultDashboard("manager"),
    );
  });

  it("відкидає невідомі типи віджетів", () => {
    const cfg = sanitizeDashboardConfig(
      {
        widgets: [
          { id: "a", type: "greeting", w: 4 },
          { id: "b", type: "__hacker__", w: 4 },
          { id: "c", type: "tiles", w: 2 },
        ],
      },
      "manager",
    );
    expect(cfg.widgets.map((w) => w.type)).toEqual(["greeting", "tiles"]);
  });

  it("клампить ширину у межі minW..maxW віджета", () => {
    const cfg = sanitizeDashboardConfig(
      {
        widgets: [
          { id: "a", type: "my-clients", w: 99 }, // maxW=2
          { id: "b", type: "greeting", w: 0 }, // minW=2
        ],
      },
      "manager",
    );
    expect(cfg.widgets[0]?.w).toBe(getWidgetDef("my-clients")?.maxW);
    expect(cfg.widgets[1]?.w).toBe(getWidgetDef("greeting")?.minW);
  });

  it("прибирає фінансові віджети для не-фінансової ролі", () => {
    const cfg = sanitizeDashboardConfig(
      {
        widgets: [
          { id: "a", type: "greeting", w: 4 },
          { id: "b", type: "fin-revenue", w: 1 },
        ],
      },
      "manager",
    );
    expect(cfg.widgets.map((w) => w.type)).toEqual(["greeting"]);
  });

  it("зберігає фінансові віджети для owner", () => {
    const cfg = sanitizeDashboardConfig(
      { widgets: [{ id: "a", type: "fin-revenue", w: 2 }] },
      "owner",
    );
    expect(cfg.widgets.map((w) => w.type)).toEqual(["fin-revenue"]);
  });

  it("дедуплікує однакові id", () => {
    const cfg = sanitizeDashboardConfig(
      {
        widgets: [
          { id: "dup", type: "greeting", w: 4 },
          { id: "dup", type: "tiles", w: 2 },
        ],
      },
      "manager",
    );
    expect(cfg.widgets).toHaveLength(1);
    expect(cfg.widgets[0]?.type).toBe("greeting");
  });

  it("нотатка: зберігає й обрізає текст до 2000 символів", () => {
    const long = "x".repeat(5000);
    const cfg = sanitizeDashboardConfig(
      { widgets: [{ id: "n", type: "note", w: 2, text: long }] },
      "manager",
    );
    expect(cfg.widgets[0]?.text?.length).toBe(2000);
  });
});
