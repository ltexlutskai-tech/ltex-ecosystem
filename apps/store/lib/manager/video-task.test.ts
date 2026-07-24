import { describe, it, expect } from "vitest";
import {
  blocksVideoTaskScan,
  endOfTomorrow,
  videoReservationData,
} from "./video-task";

describe("endOfTomorrow", () => {
  it("повертає 23:59:59.999 наступного дня", () => {
    const now = new Date(2026, 6, 23, 14, 30, 0); // 23 лип 2026, 14:30
    const r = endOfTomorrow(now);
    expect(r.getFullYear()).toBe(2026);
    expect(r.getMonth()).toBe(6);
    expect(r.getDate()).toBe(24);
    expect(r.getHours()).toBe(23);
    expect(r.getMinutes()).toBe(59);
    expect(r.getSeconds()).toBe(59);
  });

  it("коректно переходить через кінець місяця", () => {
    const now = new Date(2026, 6, 31, 9, 0, 0); // 31 лип 2026
    const r = endOfTomorrow(now);
    expect(r.getMonth()).toBe(7); // серпень
    expect(r.getDate()).toBe(1);
  });
});

describe("videoReservationData", () => {
  it("бронює лот на клієнта+менеджера завдання до вказаної дати", () => {
    const until = new Date(2026, 6, 24, 23, 59, 59);
    const data = videoReservationData(
      {
        clientId: "cli1",
        clientName: "ТОВ Ромашка",
        managerUserId: "mgr1",
        managerName: "Іван",
      },
      until,
    );
    expect(data.status).toBe("reserved");
    expect(data.reservedForClientId).toBe("cli1");
    expect(data.reservedForName).toBe("ТОВ Ромашка");
    expect(data.reservedByUserId).toBe("mgr1");
    expect(data.reservedUntil).toBe(until);
  });
});

describe("blocksVideoTaskScan", () => {
  const NOW = new Date("2026-07-23T12:00:00.000Z");
  const FUTURE = new Date("2026-07-24T23:59:59.000Z");
  const PAST = new Date("2026-07-01T00:00:00.000Z");

  it("вільний мішок (без броні) — не блокує", () => {
    expect(
      blocksVideoTaskScan(
        { status: "free", reservedByUserId: null, reservedUntil: null },
        "mgr1",
        NOW,
      ),
    ).toBe(false);
  });

  it("власна бронь менеджера-замовника — проходить (його потреба)", () => {
    expect(
      blocksVideoTaskScan(
        { status: "reserved", reservedByUserId: "mgr1", reservedUntil: FUTURE },
        "mgr1",
        NOW,
      ),
    ).toBe(false);
  });

  it("активна бронь ІНШОГО менеджера — блокує", () => {
    expect(
      blocksVideoTaskScan(
        { status: "reserved", reservedByUserId: "mgr2", reservedUntil: FUTURE },
        "mgr1",
        NOW,
      ),
    ).toBe(true);
  });

  it("протермінована чужа бронь — не блокує", () => {
    expect(
      blocksVideoTaskScan(
        { status: "reserved", reservedByUserId: "mgr2", reservedUntil: PAST },
        "mgr1",
        NOW,
      ),
    ).toBe(false);
  });

  it("завдання без менеджера: будь-яка активна бронь блокує", () => {
    expect(
      blocksVideoTaskScan(
        { status: "reserved", reservedByUserId: "mgr2", reservedUntil: FUTURE },
        null,
        NOW,
      ),
    ).toBe(true);
  });
});
