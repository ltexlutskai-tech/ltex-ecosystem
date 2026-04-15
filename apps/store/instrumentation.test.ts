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

  it("passes when both secrets are long enough in production", () => {
    expect(() =>
      validateProductionSecrets({
        NODE_ENV: "production",
        MOBILE_JWT_SECRET: VALID_SECRET,
        SYNC_API_KEY: VALID_SECRET,
      } as NodeJS.ProcessEnv),
    ).not.toThrow();
  });

  it("throws when MOBILE_JWT_SECRET is missing in production", () => {
    expect(() =>
      validateProductionSecrets({
        NODE_ENV: "production",
        MOBILE_JWT_SECRET: undefined,
        SYNC_API_KEY: VALID_SECRET,
      } as NodeJS.ProcessEnv),
    ).toThrow(/MOBILE_JWT_SECRET/);
  });

  it("throws when MOBILE_JWT_SECRET is too short in production", () => {
    expect(() =>
      validateProductionSecrets({
        NODE_ENV: "production",
        MOBILE_JWT_SECRET: SHORT_SECRET,
        SYNC_API_KEY: VALID_SECRET,
      } as NodeJS.ProcessEnv),
    ).toThrow(/MOBILE_JWT_SECRET/);
  });

  it("throws when SYNC_API_KEY is missing in production", () => {
    expect(() =>
      validateProductionSecrets({
        NODE_ENV: "production",
        MOBILE_JWT_SECRET: VALID_SECRET,
        SYNC_API_KEY: undefined,
      } as NodeJS.ProcessEnv),
    ).toThrow(/SYNC_API_KEY/);
  });

  it("throws when SYNC_API_KEY is too short in production", () => {
    expect(() =>
      validateProductionSecrets({
        NODE_ENV: "production",
        MOBILE_JWT_SECRET: VALID_SECRET,
        SYNC_API_KEY: SHORT_SECRET,
      } as NodeJS.ProcessEnv),
    ).toThrow(/SYNC_API_KEY/);
  });

  it("error message mentions openssl rand for MOBILE_JWT_SECRET", () => {
    expect(() =>
      validateProductionSecrets({
        NODE_ENV: "production",
        MOBILE_JWT_SECRET: "",
        SYNC_API_KEY: VALID_SECRET,
      } as NodeJS.ProcessEnv),
    ).toThrow(/openssl rand -hex 32/);
  });
});
