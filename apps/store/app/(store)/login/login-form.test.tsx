import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { LoginForm } from "./login-form";
import { UA_REGIONS } from "@ltex/shared";

const replaceMock = vi.fn();
const refreshMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock, refresh: refreshMock }),
}));

afterEach(() => {
  replaceMock.mockReset();
  refreshMock.mockReset();
  cleanup();
  vi.restoreAllMocks();
});

describe("LoginForm", () => {
  it("renders the region dropdown with all UA_REGIONS options + placeholder", () => {
    render(<LoginForm returnTo="/" />);
    const select = screen.getByLabelText("Область") as HTMLSelectElement;
    expect(select).toBeDefined();
    // 27 regions + 1 placeholder
    expect(select.options.length).toBe(UA_REGIONS.length + 1);
    expect(select.options[0]?.value).toBe("");
    for (const region of UA_REGIONS) {
      expect(Array.from(select.options).some((o) => o.value === region)).toBe(
        true,
      );
    }
  });

  it("submits the chosen region as `city` in the JSON body", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
      );

    render(<LoginForm returnTo="/" />);
    const phone = screen.getByLabelText("Номер телефону") as HTMLInputElement;
    const name = screen.getByLabelText("Імʼя") as HTMLInputElement;
    const region = screen.getByLabelText("Область") as HTMLSelectElement;

    fireEvent.change(phone, { target: { value: "+380 67 123 45 67" } });
    fireEvent.change(name, { target: { value: "Іван" } });
    fireEvent.change(region, { target: { value: "Волинська" } });

    const submit = screen.getByRole("button", { name: "Увійти" });
    fireEvent.click(submit);

    // Wait a microtask for the async submit handler.
    await new Promise((r) => setTimeout(r, 0));

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [, init] = fetchSpy.mock.calls[0]!;
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.city).toBe("Волинська");
    expect(body.name).toBe("Іван");
  });
});
