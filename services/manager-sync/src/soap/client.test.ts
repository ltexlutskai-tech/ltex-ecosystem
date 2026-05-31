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
  onecHttpUser: undefined,
  onecHttpPassword: undefined,
  onecTimeoutMs: 5000,
};

function buildOkResponse(returnJson: string): Response {
  const body = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <ms:ОбновитиКлиентаJSONResponse xmlns:ms="http://arm_mobile">
      <ms:return>${returnJson
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")}</ms:return>
    </ms:ОбновитиКлиентаJSONResponse>
  </soap:Body>
</soap:Envelope>`;
  return new Response(body, {
    status: 200,
    headers: { "Content-Type": "text/xml; charset=utf-8" },
  });
}

describe("buildJsonDataEnvelope", () => {
  it("серіалізує {idempotencyKey, password, data} як очікує BSL (Molenari OU rework)", () => {
    const json = buildJsonDataEnvelope("key-1", "secret-pwd", {
      name: "L-TEX",
      code1C: "X",
    });
    expect(JSON.parse(json)).toEqual({
      idempotencyKey: "key-1",
      password: "secret-pwd",
      data: { name: "L-TEX", code1C: "X" },
    });
  });
});

describe("buildSoapEnvelope", () => {
  it("XML-escapes special chars у JSONДани (пароль тепер всередині JSON)", () => {
    const env = buildSoapEnvelope({
      operation: "ОбновитиКлиентаJSON",
      password: 'p"ass<>&',
      idempotencyKey: "550e8400-e29b-41d4-a716-446655440000",
      payload: { name: "A & B" },
    });
    // <ms:ПарольВхода> завжди порожній (BSL читає з JSON).
    expect(env).toContain("<ms:ПарольВхода></ms:ПарольВхода>");
    // JSONДани містить escape-ний JSON з паролем і payload-ом всередині.
    expect(env).toContain("&quot;A &amp; B&quot;");
    // пароль зі спецсимволами теж escape-ється у JSON-стрічці.
    expect(env).toContain("p\\&quot;ass&lt;&gt;&amp;");
  });

  it("використовує 2-параметровий BSL-контракт (ПарольВхода порожній + JSONДани)", () => {
    const env = buildSoapEnvelope({
      operation: "ОбновитиКлиентаJSON",
      password: "secret",
      idempotencyKey: "key-42",
      payload: { code1C: "000001" },
    });
    // ПарольВхода завжди порожній — пароль міграно у JSON-поле.
    expect(env).toContain("<ms:ПарольВхода></ms:ПарольВхода>");
    expect(env).toContain("<ms:JSONДани>");
    expect(env).toContain("</ms:JSONДани>");
    // Старий 3-параметровий контракт прибрано.
    expect(env).not.toContain("<ms:IdempotencyKey>");
    expect(env).not.toContain("<ms:ПакетДанних>");
  });

  it("кладе idempotencyKey + password ВСЕРЕДИНУ JSONДани payload-у", () => {
    const env = buildSoapEnvelope({
      operation: "СтворитиЗамовленняJSON",
      password: "shared-secret",
      idempotencyKey: "uniq-123",
      payload: { customerCode1C: "000001" },
    });
    // після unescape JSONДани має містити усі три ключі
    const unescaped = env
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">");
    expect(unescaped).toContain('"idempotencyKey":"uniq-123"');
    expect(unescaped).toContain('"password":"shared-secret"');
    expect(unescaped).toContain('"data":{"customerCode1C":"000001"}');
  });

  it("повертає порожній SOAPAction (HTTP header не приймає Cyrillic)", () => {
    expect(buildSoapAction("ОбновитиКлиентаJSON")).toBe('""');
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
    expect(body).toContain("ОбновитиКлиентаJSON");
    // idempotencyKey тепер всередині JSONДани payload-у, не окремим елементом.
    expect(body).toContain("550e8400-e29b-41d4-a716-446655440000");
    expect(body).toContain("<ms:JSONДани>");
    expect(body).not.toContain("<ms:IdempotencyKey>");
    // ПарольВхода завжди порожній — пароль міграно у JSON.
    expect(body).toContain("<ms:ПарольВхода></ms:ПарольВхода>");
    // Пароль (з config.onecPassword) сидить у JSON-полі.
    const unescaped = body
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">");
    expect(unescaped).toContain('"password":"shared-secret"');
    // SOAPAction порожній — HTTP header не приймає Cyrillic у operation name.
    const headers = init.headers as Record<string, string>;
    expect(headers.SOAPAction).toBe('""');
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
