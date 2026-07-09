import { describe, it, expect, vi } from "vitest";

// Мок @ltex/db: prisma (не використовується — db передаємо явно), Prisma (лише
// як namespace типів у модулі — значення не потрібне).
vi.mock("@ltex/db", () => ({ prisma: {}, Prisma: {} }));

import {
  buildBagStateApply,
  applyBagStateChange,
  removeBagStateChange,
  endOfDay,
  isBeforeToday,
  startOfToday,
  type BagStateLineInput,
} from "./bag-state-hooks";

const occurredAt = new Date("2026-07-14T10:00:00Z");

function line(over: Partial<BagStateLineInput> = {}): BagStateLineInput {
  return {
    lotId: "lot1",
    barcode: "BC1",
    productId: "P1",
    previousHadVideo: false,
    isOpen: false,
    hasVideo: false,
    isTarget: false,
    youtubeUrl: null,
    description: null,
    comment: null,
    onAir: false,
    onAirDelivery: false,
    reservedAgentUserId: null,
    reservedAgentName: null,
    reservedClientId: null,
    reservedClientName: null,
    reservedUntil: null,
    sector: null,
    ...over,
  };
}

// ─── Дата-хелпери ────────────────────────────────────────────────────────────

describe("endOfDay / startOfToday / isBeforeToday", () => {
  it("endOfDay ставить 23:59:59.999 того ж дня", () => {
    const d = endOfDay(new Date("2026-07-14T08:15:00"));
    expect(d.getHours()).toBe(23);
    expect(d.getMinutes()).toBe(59);
    expect(d.getSeconds()).toBe(59);
    expect(d.getMilliseconds()).toBe(999);
    expect(d.getDate()).toBe(14);
  });

  it("startOfToday обнуляє час", () => {
    const s = startOfToday(new Date("2026-07-14T18:00:00"));
    expect(s.getHours()).toBe(0);
    expect(s.getMinutes()).toBe(0);
  });

  it("isBeforeToday: вчора → true, сьогодні/завтра → false", () => {
    const now = new Date("2026-07-14T12:00:00");
    expect(isBeforeToday(new Date("2026-07-13T23:00:00"), now)).toBe(true);
    expect(isBeforeToday(new Date("2026-07-14T00:30:00"), now)).toBe(false);
    expect(isBeforeToday(new Date("2026-07-15T01:00:00"), now)).toBe(false);
  });
});

// ─── Чисте ядро ──────────────────────────────────────────────────────────────

describe("buildBagStateApply — мапінг полів у лот", () => {
  it("переносить булеві + текстові поля у data лота", () => {
    const plan = buildBagStateApply({
      recorderDocId: "DOC1",
      occurredAt,
      changedByUserId: "U1",
      lines: [
        line({
          isOpen: true,
          isTarget: true,
          onAir: true,
          onAirDelivery: true,
          description: "опис",
          comment: "коментар",
          sector: "A-12",
        }),
      ],
    });
    expect(plan.lotUpdates).toHaveLength(1);
    const d = plan.lotUpdates[0]!.data;
    expect(d).toMatchObject({
      isOpen: true,
      isTarget: true,
      onAir: true,
      onAirDelivery: true,
      description: "опис",
      comment: "коментар",
      sector: "A-12",
    });
    expect(plan.lotUpdates[0]!.sectorName).toBe("A-12");
  });

  it("videoUrl/videoDate пишуться ЛИШЕ коли hasVideo (інакше не чіпаємо)", () => {
    const withVideo = buildBagStateApply({
      recorderDocId: "D",
      occurredAt,
      changedByUserId: null,
      lines: [line({ hasVideo: true, youtubeUrl: "https://y/1" })],
    });
    expect(withVideo.lotUpdates[0]!.data).toMatchObject({
      videoUrl: "https://y/1",
      videoDate: occurredAt,
    });

    const noVideo = buildBagStateApply({
      recorderDocId: "D",
      occurredAt,
      changedByUserId: null,
      lines: [line({ hasVideo: false, youtubeUrl: "https://y/1" })],
    });
    expect(noVideo.lotUpdates[0]!.data).not.toHaveProperty("videoUrl");
    expect(noVideo.lotUpdates[0]!.data).not.toHaveProperty("videoDate");
  });

  it("бронь: reservedBy*/reservedFor* + status=reserved коли є клієнт", () => {
    const plan = buildBagStateApply({
      recorderDocId: "D",
      occurredAt,
      changedByUserId: null,
      lines: [
        line({
          reservedAgentUserId: "AG1",
          reservedAgentName: "Агент",
          reservedClientId: "CL1",
          reservedClientName: "Клієнт",
          reservedUntil: new Date("2026-07-20T09:00:00"),
        }),
      ],
    });
    const d = plan.lotUpdates[0]!.data;
    expect(d).toMatchObject({
      reservedByUserId: "AG1",
      reservedByName: "Агент",
      reservedForClientId: "CL1",
      reservedForName: "Клієнт",
      status: "reserved",
    });
    // reservedUntil = endOfDay
    const until = d.reservedUntil as Date;
    expect(until.getHours()).toBe(23);
    expect(until.getDate()).toBe(20);
  });

  it("без клієнта броні статус НЕ виставляється", () => {
    const plan = buildBagStateApply({
      recorderDocId: "D",
      occurredAt,
      changedByUserId: null,
      lines: [line({ reservedAgentUserId: "AG1", reservedAgentName: "Агент" })],
    });
    expect(plan.lotUpdates[0]!.data).not.toHaveProperty("status");
  });
});

describe("buildBagStateApply — журнал історії", () => {
  it("пише один рядок історії на рядок з реєстратором + occurredAt + user", () => {
    const plan = buildBagStateApply({
      recorderDocId: "DOC9",
      occurredAt,
      changedByUserId: "U7",
      lines: [line({ barcode: "B1" }), line({ lotId: "lot2", barcode: "B2" })],
    });
    expect(plan.historyRows).toHaveLength(2);
    expect(plan.historyRows[0]).toMatchObject({
      lotId: "lot1",
      barcode: "B1",
      recorderDocId: "DOC9",
      occurredAt,
      changedByUserId: "U7",
    });
    expect(plan.historyRows[1]!.barcode).toBe("B2");
  });

  it("reservedUntil у історії теж endOfDay", () => {
    const plan = buildBagStateApply({
      recorderDocId: "D",
      occurredAt,
      changedByUserId: null,
      lines: [line({ reservedUntil: new Date("2026-07-20T05:00:00") })],
    });
    const until = plan.historyRows[0]!.reservedUntil as Date;
    expect(until.getHours()).toBe(23);
  });
});

describe("buildBagStateApply — тригер відео", () => {
  it("спрацьовує лише коли newly-video + агент + клієнт", () => {
    const plan = buildBagStateApply({
      recorderDocId: "D",
      occurredAt,
      changedByUserId: null,
      lines: [
        line({
          barcode: "OK",
          hasVideo: true,
          previousHadVideo: false,
          reservedAgentUserId: "AG",
          reservedClientId: "CL",
        }),
      ],
    });
    expect(plan.videoTriggers).toHaveLength(1);
    expect(plan.videoTriggers[0]).toMatchObject({
      barcode: "OK",
      reservedAgentUserId: "AG",
      reservedClientId: "CL",
    });
  });

  it("НЕ спрацьовує коли відео вже було (previousHadVideo)", () => {
    const plan = buildBagStateApply({
      recorderDocId: "D",
      occurredAt,
      changedByUserId: null,
      lines: [
        line({
          hasVideo: true,
          previousHadVideo: true,
          reservedAgentUserId: "AG",
          reservedClientId: "CL",
        }),
      ],
    });
    expect(plan.videoTriggers).toHaveLength(0);
  });

  it("НЕ спрацьовує без агента або без клієнта", () => {
    const noAgent = buildBagStateApply({
      recorderDocId: "D",
      occurredAt,
      changedByUserId: null,
      lines: [line({ hasVideo: true, reservedClientId: "CL" })],
    });
    expect(noAgent.videoTriggers).toHaveLength(0);
    const noClient = buildBagStateApply({
      recorderDocId: "D",
      occurredAt,
      changedByUserId: null,
      lines: [line({ hasVideo: true, reservedAgentUserId: "AG" })],
    });
    expect(noClient.videoTriggers).toHaveLength(0);
  });
});

// ─── apply / remove з мок-БД ────────────────────────────────────────────────

interface Cap {
  lotUpdate: unknown[];
  itemUpdateMany: unknown[];
  historyDeleteMany: unknown[];
  historyCreateMany: unknown[];
  docUpdate: unknown[];
  reminderCreate: unknown[];
  sectorFindFirst: unknown[];
  sectorCreate: unknown[];
  seq: string[];
}

function makeDb(
  doc: unknown,
  lots: unknown[],
  agents: unknown[] = [],
  clients: unknown[] = [],
  opts: { existingSector?: boolean } = {},
): { db: unknown; cap: Cap } {
  const cap: Cap = {
    lotUpdate: [],
    itemUpdateMany: [],
    historyDeleteMany: [],
    historyCreateMany: [],
    docUpdate: [],
    reminderCreate: [],
    sectorFindFirst: [],
    sectorCreate: [],
    seq: [],
  };
  const tx = {
    lot: {
      update: vi.fn(async (a: unknown) => {
        cap.lotUpdate.push(a);
      }),
    },
    bagStateChangeItem: {
      updateMany: vi.fn(async (a: unknown) => {
        cap.itemUpdateMany.push(a);
      }),
    },
    lotStateHistory: {
      deleteMany: vi.fn(async (a: unknown) => {
        cap.historyDeleteMany.push(a);
        cap.seq.push("delete");
      }),
      createMany: vi.fn(async (a: unknown) => {
        cap.historyCreateMany.push(a);
        cap.seq.push("create");
      }),
    },
    bagStateChange: {
      update: vi.fn(async (a: unknown) => {
        cap.docUpdate.push(a);
      }),
    },
    warehouseSector: {
      findFirst: vi.fn(async (a: unknown) => {
        cap.sectorFindFirst.push(a);
        return opts.existingSector ? { id: "sec-existing" } : null;
      }),
      create: vi.fn(async (a: unknown) => {
        cap.sectorCreate.push(a);
        return { id: "sec-new" };
      }),
    },
  };
  const db = {
    bagStateChange: {
      findUnique: vi.fn(async () => doc),
      update: vi.fn(async (a: unknown) => {
        cap.docUpdate.push(a);
      }),
    },
    lot: { findMany: vi.fn(async () => lots) },
    user: { findMany: vi.fn(async () => agents) },
    mgrClient: { findMany: vi.fn(async () => clients) },
    mgrReminder: {
      create: vi.fn(async (a: unknown) => {
        cap.reminderCreate.push(a);
        return { id: "rem1" };
      }),
    },
    lotStateHistory: {
      deleteMany: vi.fn(async () => undefined),
    },
    $transaction: vi.fn(async (cb: (t: unknown) => Promise<unknown>) => cb(tx)),
  };
  return { db, cap };
}

function docWith(items: unknown[]) {
  return { id: "DOC1", docDate: occurredAt, items };
}

function itemRec(over: Record<string, unknown> = {}) {
  return {
    id: "it1",
    barcode: "BC1",
    isOpen: false,
    hasVideo: false,
    isTarget: false,
    youtubeUrl: null,
    description: null,
    comment: null,
    onAir: false,
    onAirDelivery: false,
    reservedAgentUserId: null,
    reservedClientId: null,
    reservedUntil: null,
    sector: null,
    ...over,
  };
}

type ApplyDb = Parameters<typeof applyBagStateChange>[2];

describe("applyBagStateChange — проведення", () => {
  it("кидає bag_not_found коли ШК рядка не резолвиться у лот", async () => {
    const doc = docWith([itemRec({ barcode: "MISSING" })]);
    const { db } = makeDb(doc, []); // жодного лота
    await expect(
      applyBagStateChange("DOC1", "U1", db as ApplyDb),
    ).rejects.toThrow(/bag_not_found:MISSING/);
  });

  it("find-or-create сектора за назвою + оновлення лота + шапка posted", async () => {
    const doc = docWith([itemRec({ barcode: "BC1", sector: "A-1" })]);
    const lots = [
      { id: "lot1", barcode: "BC1", videoUrl: null, productId: "P1" },
    ];
    const { db, cap } = makeDb(doc, lots);
    const res = await applyBagStateChange("DOC1", "U1", db as ApplyDb);

    expect(res.itemsUpdated).toBe(1);
    // Сектор не існував → створено новий, id підставлено у лот.
    expect(cap.sectorCreate).toHaveLength(1);
    const lotUpd = cap.lotUpdate[0] as {
      where: { id: string };
      data: { sectorId: string };
    };
    expect(lotUpd.where.id).toBe("lot1");
    expect(lotUpd.data.sectorId).toBe("sec-new");
    // Шапка → posted (update викликано у tx).
    const posted = cap.docUpdate.find(
      (u) => (u as { data?: { status?: string } }).data?.status === "posted",
    );
    expect(posted).toBeTruthy();
  });

  it("існуючий сектор НЕ створюється повторно", async () => {
    const doc = docWith([itemRec({ barcode: "BC1", sector: "A-1" })]);
    const lots = [
      { id: "lot1", barcode: "BC1", videoUrl: null, productId: "P1" },
    ];
    const { db, cap } = makeDb(doc, lots, [], [], { existingSector: true });
    await applyBagStateChange("DOC1", "U1", db as ApplyDb);
    expect(cap.sectorCreate).toHaveLength(0);
    expect(
      (cap.lotUpdate[0] as { data: { sectorId: string } }).data.sectorId,
    ).toBe("sec-existing");
  });

  it("ідемпотентність історії: delete перед create за реєстратором", async () => {
    const doc = docWith([itemRec({ barcode: "BC1" })]);
    const lots = [
      { id: "lot1", barcode: "BC1", videoUrl: null, productId: "P1" },
    ];
    const { db, cap } = makeDb(doc, lots);
    await applyBagStateChange("DOC1", "U1", db as ApplyDb);
    expect(cap.historyDeleteMany[0]).toMatchObject({
      where: { recorderDocId: "DOC1" },
    });
    expect(cap.seq.indexOf("delete")).toBeLessThan(cap.seq.indexOf("create"));
  });

  it("тригер відео → створює одне нагадування агенту (viber_video)", async () => {
    const doc = docWith([
      itemRec({
        barcode: "BC1",
        hasVideo: true,
        youtubeUrl: "https://y/1",
        reservedAgentUserId: "AG1",
        reservedClientId: "CL1",
      }),
    ]);
    const lots = [
      { id: "lot1", barcode: "BC1", videoUrl: null, productId: "P1" },
    ];
    const { db, cap } = makeDb(
      doc,
      lots,
      [{ id: "AG1", fullName: "Агент" }],
      [{ id: "CL1", name: "Клієнт" }],
    );
    const res = await applyBagStateChange("DOC1", "U1", db as ApplyDb);
    expect(res.videoRemindersCreated).toBe(1);
    expect(cap.reminderCreate[0]).toMatchObject({
      data: {
        ownerUserId: "AG1",
        clientId: "CL1",
        orderVideo: true,
        actionType: "viber_video",
        source: "auto_video",
        periodicity: "event",
        lotId: "lot1",
        productId: "P1",
      },
    });
  });

  it("НЕ тригерить відео коли лот уже мав videoUrl (previousHadVideo)", async () => {
    const doc = docWith([
      itemRec({
        barcode: "BC1",
        hasVideo: true,
        reservedAgentUserId: "AG1",
        reservedClientId: "CL1",
      }),
    ]);
    const lots = [
      { id: "lot1", barcode: "BC1", videoUrl: "https://old", productId: "P1" },
    ];
    const { db, cap } = makeDb(
      doc,
      lots,
      [{ id: "AG1", fullName: "Агент" }],
      [{ id: "CL1", name: "Клієнт" }],
    );
    const res = await applyBagStateChange("DOC1", "U1", db as ApplyDb);
    expect(res.videoRemindersCreated).toBe(0);
    expect(cap.reminderCreate).toHaveLength(0);
  });
});

describe("removeBagStateChange — реверс", () => {
  it("видаляє журнал історії за реєстратором", async () => {
    const deleteMany = vi.fn(async () => undefined);
    const db = { lotStateHistory: { deleteMany } };
    await removeBagStateChange(
      "DOC1",
      db as unknown as Parameters<typeof removeBagStateChange>[1],
    );
    expect(deleteMany).toHaveBeenCalledWith({
      where: { recorderDocId: "DOC1" },
    });
  });

  it("не кидає при помилці БД (best-effort)", async () => {
    const db = {
      lotStateHistory: {
        deleteMany: vi.fn(async () => {
          throw new Error("db down");
        }),
      },
    };
    await expect(
      removeBagStateChange(
        "DOC1",
        db as unknown as Parameters<typeof removeBagStateChange>[1],
      ),
    ).resolves.toBeUndefined();
  });
});
