import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { BulkFieldDialog } from "./bulk-field-dialog";
import type { SerializedBulkField } from "@/lib/manager/bulk-edit/registry";

const refresh = vi.fn();
const toast = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh }),
}));

vi.mock("@ltex/ui", () => ({
  useToast: () => ({ toast }),
}));

const FIELDS: SerializedBulkField[] = [
  {
    key: "packaging",
    label: "Пакування",
    type: "enum",
    nullable: true,
    options: [
      { value: "box", label: "Коробка" },
      { value: "bag", label: "Мішок" },
    ],
  },
];

afterEach(() => cleanup());
beforeEach(() => {
  refresh.mockClear();
  toast.mockClear();
  vi.unstubAllGlobals();
});

describe("BulkFieldDialog — групова обробка", () => {
  it("renders selected count and applies the chosen field/value", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ ok: true, updated: 2 }), { status: 200 }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const onDone = vi.fn();
    render(
      <BulkFieldDialog
        entity="product"
        fields={FIELDS}
        ids={["a", "b"]}
        open={true}
        onClose={vi.fn()}
        onDone={onDone}
      />,
    );

    expect(screen.getByText(/Обрано обʼєктів: 2/)).toBeTruthy();

    fireEvent.click(screen.getByText("Застосувати до 2"));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/v1/manager/bulk-edit");
    const body = JSON.parse(init.body as string) as {
      entity: string;
      fieldKey: string;
      value: unknown;
      ids: string[];
    };
    expect(body).toEqual({
      entity: "product",
      fieldKey: "packaging",
      value: "box",
      ids: ["a", "b"],
    });
    await waitFor(() => expect(onDone).toHaveBeenCalled());
  });

  it("renders nothing when closed", () => {
    render(
      <BulkFieldDialog
        entity="product"
        fields={FIELDS}
        ids={["a"]}
        open={false}
        onClose={vi.fn()}
        onDone={vi.fn()}
      />,
    );
    expect(screen.queryByText(/Групова обробка/)).toBeNull();
  });
});
