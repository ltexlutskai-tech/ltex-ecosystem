import { describe, it, expect, vi } from "vitest";
import { updateClientViaSoap } from "./client";
import {
  buildJsonDataEnvelope,
  buildSoapAction,
  buildSoapEnvelope,
  extractSoapReturn,
} from "./envelope";
import type { SyncConfig } from "../config";

const liveConfig: SyncConfig = {
  port: 3001,
  sharedSecret: "x".repeat(32),
  mockMode: false,
  onecUrl: "https://1c-test.local/ltex/ws/MobileExchange.1cws",
  onecPassword: "shared-secret",
  onecTimeoutMs: 5000,
};

function buildOkResponse(returnJson: string): Response {
  const body = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <ms:ОбновитиКлієнтаJSONResponse xmlns:ms="http://arm_mobile">
      <ms:return>${returnJson
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")}</ms:return>
    </ms:ОбновитиКлієнтаJSONResponse>
  </soap:Body>
</soap:Envelope>`;
  return new Response(body, {
    status: 200,
    headers: { "Content-Type": "text/xml; charset=utf-8" },
  });
}

describe("buildJsonDataEnvelope", () => {
  it("серіалізує {idempotencyKey, data} як очікує BSL", () => {
    const json = buildJsonDataEnvelope("key-1", { name: "L-TEX", code1C: "X" });
    expect(JSON.parse(json)).toEqual({
      idempotencyKey: "key-1",
      data: { name: "L-TEX", code1C: "X" },
    });
  });
});

describe("buildSoapEnvelope", () => {
  it("XML-escapes special chars у password і payload", () => {
    const env = buildSoapEnvelope({
      operation: "ОбновитиКлієнтаJSON",
      password: 'p"ass<>&',
      idempotencyKey: "550e8400-e29b-41d4-a716-446655440000",
      payload: { name: "A & B" },
    });
    expect(env).toContain(
      "<ms:ПарольВхода>p&quot;ass&lt;&gt;&amp;</ms:ПарольВхода>",
    );
    // JSONДані містить escape-ний JSON з ім'ям всередині.
    expect(env).toContain("&quot;A &amp; B&quot;");
  });

  it("використовує 2-параметровий BSL-контракт (ПарольВхода + JSONДані)", () => {
    const env = buildSoapEnvelope({
      operation: "ОбновитиКлієнтаJSON",
      password: "secret",
      idempotencyKey: "key-42",
      payload: { code1C: "000001" },
    });
    expect(env).toContain("<ms:ПарольВхода>secret</ms:ПарольВхода>");
    expect(env).toContain("<ms:JSONДані>");
    expect(env).toContain("</ms:JSONДані>");
    // Старий 3-параметровий контракт прибрано.
    expect(env).not.toContain("<ms:IdempotencyKey>");
    expect(env).not.toContain("<ms:ПакетДанних>");
  });

  it("кладе idempotencyKey ВСЕРЕДИНУ JSONДані payload-у", () => {
    const env = buildSoapEnvelope({
      operation: "СтворитиЗамовленняJSON",
      password: "p",
      idempotencyKey: "uniq-123",
      payload: { customerCode1C: "000001" },
    });
    // після unescape JSONДані має містити обидва ключі
    const unescaped = env
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">");
    expect(unescaped).toContain('"idempotencyKey":"uniq-123"');
    expect(unescaped).toContain('"data":{"customerCode1C":"000001"}');
  });

  it("збирає валідний SOAP action header з JSON-суфіксом", () => {
    expect(buildSoapAction("ОбновитиКлієнтаJSON")).toBe(
      '"http://arm_mobile#MobileExchange:ОбновитиКлієнтаJSON"',
    );
  });
});

describe("extractSoapReturn", () => {
  it("витягує <return> текст з namespaced response", () => {
    const body =
      '<soap:Envelope><soap:Body><ms:Foo><ms:return>{"ok":true}</ms:return></ms:Foo></soap:Body></soap:Envelope>';
    expect(extractSoapReturn(body)).toBe('{"ok":true}');
  });

  it("unescape XML entities всередині <return>", () => {
    const body =
      "<return>{&quot;ok&quot;:true,&quot;code1C&quot;:&quot;X&amp;Y&quot;}</return>";
    expect(extractSoapReturn(body)).toBe('{"ok":true,"code1C":"X&Y"}');
  });

  it("strip-ить BOM якщо 1С префіксує", () => {
    const body = '<return>﻿{"ok":true}</return>';
    expect(extractSoapReturn(body)).toBe('{"ok":true}');
  });

  it("кидає коли <return> відсутній", () => {
    expect(() => extractSoapReturn("<soap:Body></soap:Body>")).toThrow(
      /return/,
    );
  });
});

describe("updateClientViaSoap", () => {
  it("happy path: parse-ить ok=true SOAP response (BSL формат code1C)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      // BSL формат: {ok, code1C, alreadyProcessed, error}.
      buildOkResponse(
        '{"ok":true,"code1C":"000005798","alreadyProcessed":false,"error":null}',
      ),
    );
    const result = await updateClientViaSoap(
      {
        idempotencyKey: "550e8400-e29b-41d4-a716-446655440000",
        payload: { code1C: "000005798", name: "Test" },
      },
      liveConfig,
      fetchMock as unknown as typeof fetch,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.code1C).toBe("000005798");
    }
    expect(fetchMock).toHaveBeenCalledOnce();
    const fetchArgs = fetchMock.mock.calls[0];
    expect(fetchArgs?.[0]).toBe(liveConfig.onecUrl);
    const init = fetchArgs?.[1] as RequestInit;
    const body = init.body as string;
    // Operation name з JSON-суфіксом.
    expect(body).toContain("ОбновитиКлієнтаJSON");
    // idempotencyKey тепер всередині JSONДані payload-у, не окремим елементом.
    expect(body).toContain("550e8400-e29b-41d4-a716-446655440000");
    expect(body).toContain("<ms:JSONДані>");
    expect(body).not.toContain("<ms:IdempotencyKey>");
    // SOAPAction теж з JSON-суфіксом.
    const headers = init.headers as Record<string, string>;
    expect(headers.SOAPAction).toBe(
      '"http://arm_mobile#MobileExchange:ОбновитиКлієнтаJSON"',
    );
  });

  it("повертає ok=false коли BSL повернув error.message", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        buildOkResponse(
          '{"ok":false,"code1C":null,"alreadyProcessed":false,"error":{"code":"auth_failed","message":"Невірний пароль"}}',
        ),
      );
    const result = await updateClientViaSoap(
      { idempotencyKey: "k1", payload: { name: "" } },
      liveConfig,
      fetchMock as unknown as typeof fetch,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorMessage).toBe("Невірний пароль");
    }
  });

  it("повертає ok=false з legacy errorCode/errorMessage форматом", async () => {
    // Backward compat: коли mock.ts чи інша сторона шле старий формат.
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        buildOkResponse(
          '{"ok":false,"errorCode":2,"errorMessage":"name is required"}',
        ),
      );
    const result = await updateClientViaSoap(
      { idempotencyKey: "k1", payload: { name: "" } },
      liveConfig,
      fetchMock as unknown as typeof fetch,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe(2);
      expect(result.errorMessage).toBe("name is required");
    }
  });

  it("кидає коли HTTP не 2xx", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response("internal error", { status: 500 }));
    await expect(
      updateClientViaSoap(
        { idempotencyKey: "k1", payload: {} },
        liveConfig,
        fetchMock as unknown as typeof fetch,
      ),
    ).rejects.toThrow(/HTTP 500/);
  });

  it("кидає коли config.onecUrl відсутній", async () => {
    await expect(
      updateClientViaSoap(
        { idempotencyKey: "k1", payload: {} },
        { ...liveConfig, onecUrl: undefined },
      ),
    ).rejects.toThrow(/ONEC_SOAP_URL/);
  });
});
