import { describe, expect, test } from "bun:test";
import { ConfigError, DEFAULT_SERVICE_URLS, loadConfig } from "./env.config";

describe("loadConfig", () => {
  test("defaults to local, demo off, release dev and localhost service URLs", () => {
    const config = loadConfig({});
    expect(config.appEnv).toBe("local");
    expect(config.demoMode).toBe(false);
    expect(config.release).toBe("dev");
    expect(config.serviceUrls).toEqual(DEFAULT_SERVICE_URLS);
    expect(config.serviceUrls.transparency).toBe("http://localhost:8005");
  });

  test("treats empty values as unset", () => {
    const config = loadConfig({ APP_ENV: "", DEMO_MODE: " ", RELEASE: "", SERVICE_URL_TRUST: "" });
    expect(config.appEnv).toBe("local");
    expect(config.demoMode).toBe(false);
    expect(config.release).toBe("dev");
    expect(config.serviceUrls.trust).toBe("http://localhost:8003");
  });

  test("reads environment, demo mode, release and service URLs", () => {
    const config = loadConfig({
      APP_ENV: "demo",
      DEMO_MODE: "true",
      RELEASE: "2026.10.13-abc123",
      SERVICE_URL_CASE_AUDIT: "https://agesoa-demo-case-audit-xyz.a.run.app/",
    });
    expect(config.appEnv).toBe("demo");
    expect(config.demoMode).toBe(true);
    expect(config.release).toBe("2026.10.13-abc123");
    expect(config.serviceUrls["case-audit"]).toBe("https://agesoa-demo-case-audit-xyz.a.run.app");
  });

  test("refuses demo mode in prod", () => {
    expect(() => loadConfig({ APP_ENV: "prod", DEMO_MODE: "true" })).toThrow(ConfigError);
    expect(() => loadConfig({ APP_ENV: "PROD", DEMO_MODE: "1" })).toThrow(/refused/);
  });

  test("allows prod without demo mode and demo mode outside prod", () => {
    expect(loadConfig({ APP_ENV: "prod", DEMO_MODE: "false" }).demoMode).toBe(false);
    expect(loadConfig({ APP_ENV: "prod" }).appEnv).toBe("prod");
    expect(loadConfig({ APP_ENV: "staging", DEMO_MODE: "true" }).demoMode).toBe(true);
  });

  test("rejects invalid values", () => {
    expect(() => loadConfig({ APP_ENV: "production" })).toThrow(ConfigError);
    expect(() => loadConfig({ DEMO_MODE: "maybe" })).toThrow(ConfigError);
    expect(() => loadConfig({ SERVICE_URL_INGESTION: "not a url" })).toThrow(ConfigError);
    expect(() => loadConfig({ SERVICE_URL_DELIVERY: "ftp://example.com" })).toThrow(ConfigError);
  });

  test("reads the read model URL and Firebase Auth settings", () => {
    const config = loadConfig({
      READ_MODEL_URL: "http://10.0.0.1:8080/v1/projects/p/databases/(default)/documents/",
      FIREBASE_PROJECT_ID: "p",
      FIREBASE_AUTH_EMULATOR_URL: "http://localhost:9099",
    });
    expect(config.readModelUrl).toBe("http://10.0.0.1:8080/v1/projects/p/databases/(default)/documents");
    expect(config.auth).toEqual({
      apiKey: "demo-api-key",
      projectId: "p",
      authDomain: "p.firebaseapp.com",
      emulatorUrl: "http://localhost:9099",
    });
  });

  test("refuses the auth emulator outside local", () => {
    expect(() => loadConfig({ APP_ENV: "demo", FIREBASE_AUTH_EMULATOR_URL: "http://localhost:9099" })).toThrow(
      /only allowed when APP_ENV=local/,
    );
  });
});
