/**
 * Portal configuration, read from server-side environment variables only.
 * All validation lives here so that an invalid combination fails loudly in one place.
 */

export const APP_ENVS = ["local", "demo", "staging", "prod"] as const;
export type AppEnv = (typeof APP_ENVS)[number];

export const SERVICE_NAMES = ["ingestion", "case-audit", "trust", "delivery", "transparency"] as const;
export type ServiceName = (typeof SERVICE_NAMES)[number];

/** Environment variable holding the base URL of each backend service. */
export const SERVICE_URL_ENV: Record<ServiceName, string> = {
  ingestion: "SERVICE_URL_INGESTION",
  "case-audit": "SERVICE_URL_CASE_AUDIT",
  trust: "SERVICE_URL_TRUST",
  delivery: "SERVICE_URL_DELIVERY",
  transparency: "SERVICE_URL_TRANSPARENCY",
};

/** Local development ports of the services. */
export const DEFAULT_SERVICE_URLS: Record<ServiceName, string> = {
  ingestion: "http://localhost:8001",
  "case-audit": "http://localhost:8002",
  trust: "http://localhost:8003",
  delivery: "http://localhost:8004",
  transparency: "http://localhost:8005",
};

/** Local Firestore emulator (agesoa-devenv); in GCP the public Firestore REST endpoint of the project. */
export const DEFAULT_READ_MODEL_URL = "http://localhost:8080/v1/projects/agesoa-local/databases/(default)/documents";

/** Browser-side Firebase Auth settings (Identity Platform; the emulator only locally). */
export interface AuthConfig {
  apiKey: string;
  projectId: string;
  authDomain: string;
  /** http://host:port of the Firebase Auth emulator, as the browser reaches it; null outside local. */
  emulatorUrl: string | null;
}

export interface PortalConfig {
  appEnv: AppEnv;
  demoMode: boolean;
  release: string;
  serviceUrls: Record<ServiceName, string>;
  /** Base URL of the Firestore documents of the public read model (read-only for clients). */
  readModelUrl: string;
  auth: AuthConfig;
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

type Env = Record<string, string | undefined>;

function read(env: Env, name: string): string | undefined {
  const value = env[name]?.trim();
  return value ? value : undefined;
}

const TRUE_VALUES = new Set(["true", "1", "yes", "on"]);
const FALSE_VALUES = new Set(["false", "0", "no", "off"]);

export function parseBoolean(name: string, raw: string | undefined, fallback: boolean): boolean {
  if (raw === undefined) return fallback;
  const value = raw.toLowerCase();
  if (TRUE_VALUES.has(value)) return true;
  if (FALSE_VALUES.has(value)) return false;
  throw new ConfigError(`${name} must be a boolean (true/false), got "${raw}"`);
}

function parseAppEnv(raw: string | undefined): AppEnv {
  if (raw === undefined) return "local";
  const value = raw.toLowerCase();
  if ((APP_ENVS as readonly string[]).includes(value)) return value as AppEnv;
  throw new ConfigError(`APP_ENV must be one of ${APP_ENVS.join(", ")}, got "${raw}"`);
}

function parseServiceUrl(name: string, raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ConfigError(`${name} must be an absolute URL, got "${raw}"`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new ConfigError(`${name} must use http or https, got "${url.protocol}"`);
  }
  return url.toString().replace(/\/+$/, "");
}

/**
 * Loads and validates the portal configuration.
 * Throws ConfigError when a value is invalid; demo mode is refused in prod.
 */
export function loadConfig(env: Env = process.env): PortalConfig {
  const appEnv = parseAppEnv(read(env, "APP_ENV"));
  const demoMode = parseBoolean("DEMO_MODE", read(env, "DEMO_MODE"), false);
  if (appEnv === "prod" && demoMode) {
    throw new ConfigError("DEMO_MODE=true is refused when APP_ENV=prod (synthetic data must never reach production)");
  }
  const release = read(env, "RELEASE") ?? "dev";

  const serviceUrls = {} as Record<ServiceName, string>;
  for (const service of SERVICE_NAMES) {
    const variable = SERVICE_URL_ENV[service];
    serviceUrls[service] = parseServiceUrl(variable, read(env, variable) ?? DEFAULT_SERVICE_URLS[service]);
  }

  const readModelUrl = parseServiceUrl("READ_MODEL_URL", read(env, "READ_MODEL_URL") ?? DEFAULT_READ_MODEL_URL);
  const projectId = read(env, "FIREBASE_PROJECT_ID") ?? "agesoa-local";
  const emulatorRaw = read(env, "FIREBASE_AUTH_EMULATOR_URL");
  if (emulatorRaw && appEnv !== "local") {
    throw new ConfigError("FIREBASE_AUTH_EMULATOR_URL is only allowed when APP_ENV=local");
  }
  const auth: AuthConfig = {
    apiKey: read(env, "FIREBASE_API_KEY") ?? "demo-api-key",
    projectId,
    authDomain: read(env, "FIREBASE_AUTH_DOMAIN") ?? `${projectId}.firebaseapp.com`,
    emulatorUrl: emulatorRaw ? parseServiceUrl("FIREBASE_AUTH_EMULATOR_URL", emulatorRaw) : null,
  };

  return { appEnv, demoMode, release, serviceUrls, readModelUrl, auth };
}
