import { describe, it, expect, vi, beforeEach } from "vitest";

const findUnique = vi.fn();
const update = vi.fn();
const cancelEttnReceipt = vi.fn();

vi.mock("@ltex/db", () => ({
  prisma: {
    checkboxReceipt: {
      findUnique: (...a: unknown[]) => findUnique(...a),
      update: (...a: unknown[]) => update(...a),
    },
  },
}));
vi.mock("./checkbox", () => ({
  createEttnReceipt: vi.fn(),
  cancelEttnReceipt: (...a: unknown[]) => cancelEttnReceipt(...a),
}));
vi.mock("@/lib/manager/payment-summary", () => ({
  getPaymentSummary: vi.fn(),
}));

import { cancelCheckboxReceiptForSale } from "./create-receipt-for-sale";

beforeEach(() => {
  findUnique.mockReset();
  update.mockReset().mockResolvedValue({});
  cancelEttnReceipt.mockReset().mockResolvedValue({ ok: true });
});

describe("cancelCheckboxReceiptForSale", () => {
  it("скасовує чек Checkbox і позначає cancelled", async () => {
    findUnique.mockResolvedValue({ receiptId: "rc-1", status: "created" });
    await cancelCheckboxReceiptForSale("s1");
    expect(cancelEttnReceipt).toHaveBeenCalledWith("rc-1");
    expect(update).toHaveBeenCalledWith({
      where: { saleId: "s1" },
      data: { status: "cancelled" },
    });
  });

  it("пропускає, коли немає receiptId або статус не created", async () => {
    findUnique.mockResolvedValue({ receiptId: null, status: "created" });
    await cancelCheckboxReceiptForSale("s1");
    expect(cancelEttnReceipt).not.toHaveBeenCalled();

    findUnique.mockResolvedValue({ receiptId: "rc-1", status: "failed" });
    await cancelCheckboxReceiptForSale("s1");
    expect(cancelEttnReceipt).not.toHaveBeenCalled();
  });

  it("не кидає, коли запису немає", async () => {
    findUnique.mockResolvedValue(null);
    await expect(cancelCheckboxReceiptForSale("s1")).resolves.toBeUndefined();
  });
});
