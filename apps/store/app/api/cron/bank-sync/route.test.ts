import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { runBankSyncMock } = vi.hoisted(() => ({
  runBankSyncMock: vi.fn(),
}));

vi.mock("@/lib/bank/ingest", () => ({
  runBankSync: () => runBankSyncMock(),
}));

import { GET } from "./route";

const SECRET = "c".repeat(32);

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = SECRET;
  runBankSyncMock.mockResolvedValue({ mode: "client-info", accounts: 3 });
});

describe("GET /api/cron/bank-sync", () => {
  it("401 без секрета", async () => {
    const res = await GET(
      new NextRequest("http://localhost/api/cron/bank-sync"),
    );
    expect(res.status).toBe(401);
    expect(runBankSyncMock).not.toHaveBeenCalled();
  });

  it("200 з x-cron-secret + результат синку", async () => {
    const res = await GET(
      new NextRequest("http://localhost/api/cron/bank-sync", {
        headers: { "x-cron-secret": SECRET },
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.mode).toBe("client-info");
    expect(body.accounts).toBe(3);
  });

  it("200 з ?token=", async () => {
    const res = await GET(
      new NextRequest(`http://localhost/api/cron/bank-sync?token=${SECRET}`),
    );
    expect(res.status).toBe(200);
  });

  it("500 коли синк кинув помилку", async () => {
    runBankSyncMock.mockRejectedValueOnce(new Error("boom"));
    const res = await GET(
      new NextRequest("http://localhost/api/cron/bank-sync", {
        headers: { "x-cron-secret": SECRET },
      }),
    );
    expect(res.status).toBe(500);
  });
});
