import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const VALID_SECRET = "a".repeat(48);
process.env.MANAGER_JWT_SECRET = VALID_SECRET;

const { mockPrisma, getCurrentUserMock } = vi.hoisted(() => ({
  mockPrisma: {
    task: {
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
  getCurrentUserMock: vi.fn(),
}));

vi.mock("@ltex/db", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/auth/manager-auth", () => ({
  getCurrentUser: (...args: unknown[]) => getCurrentUserMock(...args),
  MANAGER_ACCESS_COOKIE: "ltex_mgr_access",
  MANAGER_REFRESH_COOKIE: "ltex_mgr_refresh",
}));

import { PATCH, DELETE } from "./route";

const params = Promise.resolve({ id: "t1" });

function patchReq(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/v1/manager/tasks/t1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function delReq(): NextRequest {
  return new NextRequest("http://localhost/api/v1/manager/tasks/t1", {
    method: "DELETE",
  });
}

const MANUAL_TASK = {
  id: "t1",
  type: "manual",
  status: "open",
  createdByUserId: "creator",
  assigneeUserId: "executor",
  assigneeRole: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.task.update.mockResolvedValue({});
  mockPrisma.task.delete.mockResolvedValue({});
});

describe("DELETE /tasks/[id]", () => {
  it("постановник вилучає завдання", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "creator",
      role: "manager",
      fullName: "Постановник",
    });
    mockPrisma.task.findUnique.mockResolvedValue(MANUAL_TASK);

    const res = await DELETE(delReq(), { params });
    expect(res.status).toBe(200);
    expect(mockPrisma.task.delete).toHaveBeenCalledWith({
      where: { id: "t1" },
    });
  });

  it("admin вилучає чуже завдання", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "admin1",
      role: "admin",
      fullName: "Адмін",
    });
    mockPrisma.task.findUnique.mockResolvedValue(MANUAL_TASK);

    const res = await DELETE(delReq(), { params });
    expect(res.status).toBe(200);
    expect(mockPrisma.task.delete).toHaveBeenCalled();
  });

  it("виконавець НЕ може вилучити (403)", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "executor",
      role: "manager",
      fullName: "Виконавець",
    });
    mockPrisma.task.findUnique.mockResolvedValue(MANUAL_TASK);

    const res = await DELETE(delReq(), { params });
    expect(res.status).toBe(403);
    expect(mockPrisma.task.delete).not.toHaveBeenCalled();
  });

  it("404 коли завдання відсутнє або не manual", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "creator",
      role: "manager",
      fullName: "X",
    });
    mockPrisma.task.findUnique.mockResolvedValue({
      ...MANUAL_TASK,
      type: "warehouse",
    });

    const res = await DELETE(delReq(), { params });
    expect(res.status).toBe(404);
  });
});

describe("PATCH /tasks/[id] — archive/unarchive", () => {
  it("виконавець відправляє в архів", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "executor",
      role: "manager",
      fullName: "Виконавець",
    });
    mockPrisma.task.findUnique.mockResolvedValue(MANUAL_TASK);

    const res = await PATCH(patchReq({ action: "archive" }), { params });
    expect(res.status).toBe(200);
    const arg = mockPrisma.task.update.mock.calls[0]![0];
    expect(arg.data.status).toBe("archived");
    expect(arg.data.archivedByName).toBe("Виконавець");
  });

  it("постановник може архівувати", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "creator",
      role: "manager",
      fullName: "Постановник",
    });
    mockPrisma.task.findUnique.mockResolvedValue(MANUAL_TASK);

    const res = await PATCH(patchReq({ action: "archive" }), { params });
    expect(res.status).toBe(200);
  });

  it("сторонній НЕ може архівувати (403)", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "stranger",
      role: "manager",
      fullName: "Хтось",
    });
    mockPrisma.task.findUnique.mockResolvedValue(MANUAL_TASK);

    const res = await PATCH(patchReq({ action: "archive" }), { params });
    expect(res.status).toBe(403);
    expect(mockPrisma.task.update).not.toHaveBeenCalled();
  });

  it("unarchive повертає у open і чистить поля архіву", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "creator",
      role: "manager",
      fullName: "Постановник",
    });
    mockPrisma.task.findUnique.mockResolvedValue({
      ...MANUAL_TASK,
      status: "archived",
    });

    const res = await PATCH(patchReq({ action: "unarchive" }), { params });
    expect(res.status).toBe(200);
    const arg = mockPrisma.task.update.mock.calls[0]![0];
    expect(arg.data.status).toBe("open");
    expect(arg.data.archivedAt).toBeNull();
    expect(arg.data.archivedByName).toBeNull();
  });
});
