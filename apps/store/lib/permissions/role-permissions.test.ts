import { describe, it, expect } from "vitest";
import {
  ROLE_PERMISSIONS,
  RESOURCES,
  canView,
  canCreate,
  canEdit,
  canDelete,
  canExport,
  isOwnerActionRole,
  type PermissionUser,
} from "./role-permissions";
import type { ManagerRole } from "@/lib/auth/jwt";

const ALL_ROLES: ManagerRole[] = [
  "manager",
  "senior_manager",
  "admin",
  "owner",
  "supervisor",
  "analyst",
  "warehouse",
  "bookkeeper",
];

function u(
  role: ManagerRole,
  permissions: PermissionUser["permissions"] = null,
): PermissionUser {
  return { role, permissions };
}

describe("ROLE_PERMISSIONS matrix", () => {
  it("кожна роль покриває усі RESOURCES (без undefined)", () => {
    for (const role of ALL_ROLES) {
      const perms = ROLE_PERMISSIONS[role];
      for (const r of RESOURCES) {
        expect(perms[r], `role=${role} resource=${r}`).toBeDefined();
        expect(perms[r].view).toMatch(/^(all|mine|none)$/);
        expect(perms[r].edit).toMatch(/^(all|mine|none)$/);
        expect(perms[r].delete).toMatch(/^(all|mine|none)$/);
      }
    }
  });

  it("admin має повний доступ до всіх ресурсів", () => {
    for (const r of RESOURCES) {
      expect(canView(u("admin"), r).allowed).toBe(true);
      expect(canCreate(u("admin"), r)).toBe(true);
      expect(canEdit(u("admin"), r)).toBe(true);
      expect(canDelete(u("admin"), r)).toBe(true);
    }
  });

  it("owner має повний доступ + isOwnerActionRole=true", () => {
    expect(isOwnerActionRole("owner")).toBe(true);
    expect(isOwnerActionRole("admin")).toBe(false);
    for (const r of RESOURCES) {
      expect(canView(u("owner"), r).allowed).toBe(true);
      expect(canEdit(u("owner"), r)).toBe(true);
    }
  });
});

describe("manager", () => {
  it("бачить тільки свої клієнти і замовлення (scope=mine)", () => {
    expect(canView(u("manager"), "clients")).toEqual({
      allowed: true,
      scope: "mine",
    });
    expect(canView(u("manager"), "orders")).toEqual({
      allowed: true,
      scope: "mine",
    });
  });

  it("редагує тільки свої замовлення (isOwner=true)", () => {
    expect(canEdit(u("manager"), "orders", true)).toBe(true);
    expect(canEdit(u("manager"), "orders", false)).toBe(false);
  });

  it("не має доступу до finance / users / settings / audit_log", () => {
    expect(canView(u("manager"), "finance").allowed).toBe(false);
    expect(canView(u("manager"), "users").allowed).toBe(false);
    expect(canView(u("manager"), "settings").allowed).toBe(false);
    expect(canView(u("manager"), "audit_log").allowed).toBe(false);
  });

  it("не може створювати поступлення (це для warehouse)", () => {
    expect(canCreate(u("manager"), "receivings")).toBe(false);
  });
});

describe("supervisor", () => {
  it("бачить ВСІ замовлення (scope=all), але редагує тільки свої (mine)", () => {
    expect(canView(u("supervisor"), "orders")).toEqual({
      allowed: true,
      scope: "all",
    });
    expect(canEdit(u("supervisor"), "orders", true)).toBe(true);
    expect(canEdit(u("supervisor"), "orders", false)).toBe(false);
  });

  it("має доступ до звітів (read-only)", () => {
    expect(canView(u("supervisor"), "reports").allowed).toBe(true);
    expect(canEdit(u("supervisor"), "reports")).toBe(false);
  });

  it("не має доступу до finance", () => {
    expect(canView(u("supervisor"), "finance").allowed).toBe(false);
  });
});

describe("analyst", () => {
  it("read-only до фінансів і всіх даних + експорт", () => {
    expect(canView(u("analyst"), "finance").allowed).toBe(true);
    expect(canEdit(u("analyst"), "finance")).toBe(false);
    expect(canExport(u("analyst"), "finance")).toBe(true);
    expect(canExport(u("analyst"), "orders")).toBe(true);
  });

  it("повний доступ до reports (створює свої звіти)", () => {
    expect(canCreate(u("analyst"), "reports")).toBe(true);
    expect(canEdit(u("analyst"), "reports")).toBe(true);
  });

  it("не редагує клієнтів і замовлення", () => {
    expect(canEdit(u("analyst"), "clients", true)).toBe(false);
    expect(canEdit(u("analyst"), "orders", true)).toBe(false);
  });

  it("не має доступу до users / settings / audit_log", () => {
    expect(canView(u("analyst"), "users").allowed).toBe(false);
    expect(canView(u("analyst"), "settings").allowed).toBe(false);
    expect(canView(u("analyst"), "audit_log").allowed).toBe(false);
  });
});

describe("warehouse", () => {
  it("створює поступлення + редагує лоти", () => {
    expect(canCreate(u("warehouse"), "receivings")).toBe(true);
    expect(canCreate(u("warehouse"), "lots")).toBe(true);
    expect(canEdit(u("warehouse"), "lots")).toBe(true);
  });

  it("бачить замовлення (для збірки), але не редагує", () => {
    expect(canView(u("warehouse"), "orders").allowed).toBe(true);
    expect(canEdit(u("warehouse"), "orders", true)).toBe(false);
  });

  it("не бачить finance і не експортує", () => {
    expect(canView(u("warehouse"), "finance").allowed).toBe(false);
    expect(canExport(u("warehouse"), "products")).toBe(false);
  });

  it("не має доступу до клієнтів / оплат", () => {
    expect(canView(u("warehouse"), "clients").allowed).toBe(false);
    expect(canView(u("warehouse"), "payments").allowed).toBe(false);
  });
});

describe("bookkeeper", () => {
  it("повний доступ до оплат і фінансів", () => {
    expect(canCreate(u("bookkeeper"), "payments")).toBe(true);
    expect(canEdit(u("bookkeeper"), "payments")).toBe(true);
    expect(canEdit(u("bookkeeper"), "finance")).toBe(true);
  });

  it("редагує клієнтів (борги) але НЕ створює нових", () => {
    expect(canCreate(u("bookkeeper"), "clients")).toBe(false);
    expect(canEdit(u("bookkeeper"), "clients")).toBe(true);
  });

  it("не редагує замовлення/реалізації", () => {
    expect(canEdit(u("bookkeeper"), "orders", true)).toBe(false);
    expect(canEdit(u("bookkeeper"), "sales", true)).toBe(false);
  });

  it("керує курсами валют", () => {
    expect(canCreate(u("bookkeeper"), "exchange_rates")).toBe(true);
    expect(canEdit(u("bookkeeper"), "exchange_rates")).toBe(true);
  });
});

describe("per-user override", () => {
  it("override на ресурс перекриває дефолт ролі", () => {
    // Менеджеру дали view=all для clients
    const user = u("manager", {
      clients: {
        view: "all",
        create: true,
        edit: "all",
        delete: "none",
        export: false,
      },
    });
    expect(canView(user, "clients")).toEqual({ allowed: true, scope: "all" });
    expect(canEdit(user, "clients", false)).toBe(true);
    // Інший ресурс — поведінка ролі manager не змінилась
    expect(canView(user, "orders")).toEqual({ allowed: true, scope: "mine" });
  });

  it("permissions=null → дефолт ролі", () => {
    expect(canView(u("manager", null), "clients").scope).toBe("mine");
  });

  it("Override на одному ресурсі НЕ ламає інші", () => {
    const user = u("warehouse", {
      finance: {
        view: "all",
        create: false,
        edit: "none",
        delete: "none",
        export: true,
      },
    });
    expect(canView(user, "finance").allowed).toBe(true); // override
    expect(canCreate(user, "receivings")).toBe(true); // дефолт warehouse
    expect(canView(user, "clients").allowed).toBe(false); // дефолт warehouse
  });
});

describe("Sanity invariants", () => {
  it("delete=mine завжди потребує isOwner=true", () => {
    // manager може видалити свої нагадування але не чужі
    expect(canDelete(u("manager"), "reminders", true)).toBe(true);
    expect(canDelete(u("manager"), "reminders", false)).toBe(false);
  });

  it("manager НЕ створює delete-операції з чужих ресурсів", () => {
    expect(canDelete(u("manager"), "users")).toBe(false);
    expect(canDelete(u("manager"), "audit_log")).toBe(false);
  });

  it("non-admin НЕ керує users", () => {
    for (const role of [
      "manager",
      "supervisor",
      "analyst",
      "warehouse",
      "bookkeeper",
    ] as ManagerRole[]) {
      expect(canEdit(u(role), "users")).toBe(false);
      expect(canCreate(u(role), "users")).toBe(false);
    }
  });

  it("тільки admin/owner мають доступ до audit_log + permissions/settings", () => {
    for (const role of ["admin", "owner"] as ManagerRole[]) {
      expect(canView(u(role), "audit_log").allowed).toBe(true);
      expect(canView(u(role), "permissions").allowed).toBe(true);
      expect(canView(u(role), "settings").allowed).toBe(true);
    }
    for (const role of [
      "manager",
      "supervisor",
      "analyst",
      "warehouse",
      "bookkeeper",
    ] as ManagerRole[]) {
      expect(canView(u(role), "audit_log").allowed).toBe(false);
      expect(canView(u(role), "settings").allowed).toBe(false);
    }
  });
});
