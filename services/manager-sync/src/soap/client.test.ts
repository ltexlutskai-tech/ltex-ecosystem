import { describe, it, expect, vi } from "vitest";
import { updateClientViaSoap } from "./client";
import {
  buildSoapEnvelope,
  buildSoapAction,
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
    <ms:ОбновитиКлієнтаResponse xmlns:ms="http://arm_mobile">
      <ms:return>${returnJson
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")}</ms:return>
    </ms:ОбновитиКлієнтаResponse>
  </soap:Body>
</soap:Envelope>`;
  return new Response(body, {
    status: 200,
    headers: { "Content-Type": "text/xml; charset=utf-8" },
  });
}

describe("buildSoapEnvelope", () => {
  it("XML-escapes special chars у password і payload", () => {
    const env = buildSoapEnvelope({
      operation: "ОбновитиКлієнта",
      password: 'p"ass<>&',
      idempotencyKey: "550e8400-e29b-41d4-a716-446655440000",
      payloadJson: '{"name":"A & B"}',
    });
    expect(env).toContain(
      "<ms:ПарольВхода>p&quot;ass&lt;&gt;&amp;</ms:ПарольВхода>",
    );
    expect(env).toContain("&quot;A &amp; B&quot;");
  });

  it("збирає валідний SOAP action header", () => {
    expect(buildSoapAction("ОбновитиКлієнта")).toBe(
      '"http://arm_mobile#MobileExchange:ОбновитиКлієнта"',
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
  it("happy path: parse-ить ok=true SOAP response", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        buildOkResponse('{"ok":true,"code1C":"000005798","errors":[]}'),
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
    expect(body).toContain("ОбновитиКлієнта");
    expect(body).toContain("550e8400-e29b-41d4-a716-446655440000");
  });

  it("повертає ok=false коли 1С повернув error response", async () => {
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
