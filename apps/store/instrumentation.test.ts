import { describe, it, expect } from "vitest";
import { validateProductionSecrets } from "./instrumentation";

const VALID_SECRET = "a".repeat(32);
const SHORT_SECRET = "short";

describe("validateProductionSecrets", () => {
  it("does nothing when NODE_ENV is not production", () => {
    expect(() =>
      validateProductionSecrets({
        NODE_ENV: "development",
        MOBILE_JWT_SECRET: undefined,
        SYNC_API_KEY: undefined,
        CUSTOMER_AUTH_SECRET: undefined,
      } as NodeJS.ProcessEnv),
    ).not.toThrow();
  });

  it("does nothing in test environment", () => {
    expect(() =>
      validateProductionSecrets({
        NODE_ENV: "test",
      } as NodeJS.ProcessEnv),
    ).not.toThrow();
  });

  it("passes when all secrets are long enough in production", () => {
    expect(() =>
      validateProductionSecrets({
        NODE_ENV: "production",
        MOBILE_JWT_SECRET: VALID_SECRET,
        SYNC_API_KEY: VALID_SECRET,
        CUSTOMER_AUTH_SECRET: VALID_SECRET,
        MANAGER_JWT_SECRET: VALID_SECRET,
      } as NodeJS.ProcessEnv),
    ).not.toThrow();
  });

  it("throws when MOBILE_JWT_SECRET is missing in production", () => {
    expect(() =>
      validateProductionSecrets({
        NODE_ENV: "production",
        MOBILE_JWT_SECRET: undefined,
        SYNC_API_KEY: VALID_SECRET,
        CUSTOMER_AUTH_SECRET: VALID_SECRET,
      } as NodeJS.ProcessEnv),
    ).toThrow(/MOBILE_JWT_SECRET/);
  });

  it("throws when MOBILE_JWT_SECRET is too short in production", () => {
    expect(() =>
      validateProductionSecrets({
        NODE_ENV: "production",
        MOBILE_JWT_SECRET: SHORT_SECRET,
        SYNC_API_KEY: VALID_SECRET,
        CUSTOMER_AUTH_SECRET: VALID_SECRET,
      } as NodeJS.ProcessEnv),
    ).toThrow(/MOBILE_JWT_SECRET/);
  });

  it("throws when CUSTOMER_AUTH_SECRET is missing in production", () => {
    expect(() =>
      validateProductionSecrets({
        NODE_ENV: "production",
        MOBILE_JWT_SECRET: VALID_SECRET,
        SYNC_API_KEY: VALID_SECRET,
        CUSTOMER_AUTH_SECRET: undefined,
      } as NodeJS.ProcessEnv),
    ).toThrow(/CUSTOMER_AUTH_SECRET/);
  });

  it("throws when CUSTOMER_AUTH_SECRET is too short in production", () => {
    expect(() =>
      validateProductionSecrets({
        NODE_ENV: "production",
        MOBILE_JWT_SECRET: VALID_SECRET,
        SYNC_API_KEY: VALID_SECRET,
        CUSTOMER_AUTH_SECRET: SHORT_SECRET,
      } as NodeJS.ProcessEnv),
    ).toThrow(/CUSTOMER_AUTH_SECRET/);
  });

  it("error message mentions openssl rand for MOBILE_JWT_SECRET", () => {
    expect(() =>
      validateProductionSecrets({
        NODE_ENV: "production",
        MOBILE_JWT_SECRET: "",
        SYNC_API_KEY: VALID_SECRET,
        CUSTOMER_AUTH_SECRET: VALID_SECRET,
      } as NodeJS.ProcessEnv),
    ).toThrow(/openssl rand -hex 32/);
  });

  it("does not require TELEGRAM_WEBHOOK_SECRET when bot token is absent", () => {
    expect(() =>
      validateProductionSecrets({
        NODE_ENV: "production",
        MOBILE_JWT_SECRET: VALID_SECRET,
        SYNC_API_KEY: VALID_SECRET,
        CUSTOMER_AUTH_SECRET: VALID_SECRET,
        MANAGER_JWT_SECRET: VALID_SECRET,
        TELEGRAM_BOT_TOKEN: undefined,
        TELEGRAM_WEBHOOK_SECRET: undefined,
      } as NodeJS.ProcessEnv),
    ).not.toThrow();
  });

  it("passes when bot token + webhook secret are both present and long enough", () => {
    expect(() =>
      validateProductionSecrets({
        NODE_ENV: "production",
        MOBILE_JWT_SECRET: VALID_SECRET,
        SYNC_API_KEY: VALID_SECRET,
        CUSTOMER_AUTH_SECRET: VALID_SECRET,
        MANAGER_JWT_SECRET: VALID_SECRET,
        TELEGRAM_BOT_TOKEN: "12345:abcdef",
        TELEGRAM_WEBHOOK_SECRET: "x".repeat(16),
      } as NodeJS.ProcessEnv),
    ).not.toThrow();
  });

  it("throws when TELEGRAM_BOT_TOKEN is set but TELEGRAM_WEBHOOK_SECRET is missing", () => {
    expect(() =>
      validateProductionSecrets({
        NODE_ENV: "production",
        MOBILE_JWT_SECRET: VALID_SECRET,
        SYNC_API_KEY: VALID_SECRET,
        CUSTOMER_AUTH_SECRET: VALID_SECRET,
        MANAGER_JWT_SECRET: VALID_SECRET,
        TELEGRAM_BOT_TOKEN: "12345:abcdef",
        TELEGRAM_WEBHOOK_SECRET: undefined,
      } as NodeJS.ProcessEnv),
    ).toThrow(/TELEGRAM_WEBHOOK_SECRET/);
  });

  it("throws when TELEGRAM_WEBHOOK_SECRET is too short", () => {
    expect(() =>
      validateProductionSecrets({
        NODE_ENV: "production",
        MOBILE_JWT_SECRET: VALID_SECRET,
        SYNC_API_KEY: VALID_SECRET,
        CUSTOMER_AUTH_SECRET: VALID_SECRET,
        MANAGER_JWT_SECRET: VALID_SECRET,
        TELEGRAM_BOT_TOKEN: "12345:abcdef",
        TELEGRAM_WEBHOOK_SECRET: "short",
      } as NodeJS.ProcessEnv),
    ).toThrow(/TELEGRAM_WEBHOOK_SECRET/);
  });

  it("throws when MANAGER_JWT_SECRET is missing in production", () => {
    expect(() =>
      validateProductionSecrets({
        NODE_ENV: "production",
        MOBILE_JWT_SECRET: VALID_SECRET,
        SYNC_API_KEY: VALID_SECRET,
        CUSTOMER_AUTH_SECRET: VALID_SECRET,
        MANAGER_JWT_SECRET: undefined,
      } as NodeJS.ProcessEnv),
    ).toThrow(/MANAGER_JWT_SECRET/);
  });

  it("throws when MANAGER_JWT_SECRET is too short in production", () => {
    expect(() =>
      validateProductionSecrets({
        NODE_ENV: "production",
        MOBILE_JWT_SECRET: VALID_SECRET,
        SYNC_API_KEY: VALID_SECRET,
        CUSTOMER_AUTH_SECRET: VALID_SECRET,
        MANAGER_JWT_SECRET: SHORT_SECRET,
      } as NodeJS.ProcessEnv),
    ).toThrow(/MANAGER_JWT_SECRET/);
  });
});
