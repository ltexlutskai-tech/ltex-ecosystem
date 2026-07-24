import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { ingestMock } = vi.hoisted(() => ({
  ingestMock: vi.fn(),
}));

vi.mock("@/lib/bank/ingest", () => ({
  ingestMonoStatementItems: (...a: unknown[]) => ingestMock(...a),
}));

import { GET, POST } from "./route";

const SECRET = "s".repeat(24);

function postReq(url: string, body: unknown): NextRequest {
  return new NextRequest(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const WEBHOOK_BODY = {
  type: "StatementItem",
  data: {
    account: "acc-1",
    statementItem: {
      id: "txn-1",
      time: 1753350000,
      amount: 95000,
      currencyCode: 980,
    },
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  process.env.MONOBANK_WEBHOOK_SECRET = SECRET;
  ingestMock.mockResolvedValue({ inserted: 1, total: 1 });
});

describe("GET /api/monobank/webhook", () => {
  it("відповідає 200 на перевірку банку", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
  });
});

describe("POST /api/monobank/webhook", () => {
  it("401 без секрета в URL", async () => {
    const res = await POST(
      postReq("http://localhost/api/monobank/webhook", WEBHOOK_BODY),
    );
    expect(res.status).toBe(401);
    expect(ingestMock).not.toHaveBeenCalled();
  });

  it("401 з хибним секретом", async () => {
    const res = await POST(
      postReq(
        "http://localhost/api/monobank/webhook?token=wrong",
        WEBHOOK_BODY,
      ),
    );
    expect(res.status).toBe(401);
  });

  it("401 коли секрет не налаштовано в env (fail-closed)", async () => {
    delete process.env.MONOBANK_WEBHOOK_SECRET;
    const res = await POST(
      postReq(
        `http://localhost/api/monobank/webhook?token=${SECRET}`,
        WEBHOOK_BODY,
      ),
    );
    expect(res.status).toBe(401);
  });

  it("валідний StatementItem → інжест + 200", async () => {
    const res = await POST(
      postReq(
        `http://localhost/api/monobank/webhook?token=${SECRET}`,
        WEBHOOK_BODY,
      ),
    );
    expect(res.status).toBe(200);
    expect(ingestMock).toHaveBeenCalledTimes(1);
    expect(ingestMock).toHaveBeenCalledWith("acc-1", [
      WEBHOOK_BODY.data.statementItem,
    ]);
  });

  it("інший тип події → 200 без інжесту", async () => {
    const res = await POST(
      postReq(`http://localhost/api/monobank/webhook?token=${SECRET}`, {
        type: "Other",
      }),
    );
    expect(res.status).toBe(200);
    expect(ingestMock).not.toHaveBeenCalled();
  });

  it("збій інжесту не валить відповідь (200, дозбере крон)", async () => {
    ingestMock.mockRejectedValueOnce(new Error("db down"));
    const res = await POST(
      postReq(
        `http://localhost/api/monobank/webhook?token=${SECRET}`,
        WEBHOOK_BODY,
      ),
    );
    expect(res.status).toBe(200);
  });
});
