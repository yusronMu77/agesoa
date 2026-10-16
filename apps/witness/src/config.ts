/**
 * Witness configuration from Vite build-time variables (VITE_*). All validation lives here so that an invalid
 * combination fails loudly in one place.
 */

export const APP_ENVS = ["local", "demo", "staging", "prod"] as const;
export type AppEnv = (typeof APP_ENVS)[number];

export const DEFAULT_INGESTION_URL = "http://localhost:8001";
export const DEFAULT_CASE_AUDIT_URL = "http://localhost:8002";

export interface WitnessConfig {
  appEnv: AppEnv;
  demoMode: boolean;
  ingestionUrl: string;
  /** case-audit: the audit questions put to the reporter (SCR-006). */
  caseAuditUrl: string;
  /** Domain pack the reports belong to. */
  domain: string;
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

type Env = Record<string, string | boolean | undefined>;

function read(env: Env, name: string): string | undefined {
  const value = env[name];
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

export function parseBoolean(name: string, raw: string | undefined, fallback: boolean): boolean {
  if (raw === undefined) return fallback;
  const value = raw.toLowerCase();
  if (["true", "1", "yes", "on"].includes(value)) return true;
  if (["false", "0", "no", "off"].includes(value)) return false;
  throw new ConfigError(`${name} must be a boolean (true/false), got "${raw}"`);
}

function parseUrl(name: string, raw: string): string {
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

export function loadConfig(env: Env = import.meta.env): WitnessConfig {
  const rawEnv = (read(env, "VITE_APP_ENV") ?? "local").toLowerCase();
  if (!(APP_ENVS as readonly string[]).includes(rawEnv)) {
    throw new ConfigError(`VITE_APP_ENV must be one of ${APP_ENVS.join(", ")}, got "${rawEnv}"`);
  }
  const appEnv = rawEnv as AppEnv;
  const demoMode = parseBoolean("VITE_DEMO_MODE", read(env, "VITE_DEMO_MODE"), false);
  if (appEnv === "prod" && demoMode) {
    throw new ConfigError("VITE_DEMO_MODE=true is refused when VITE_APP_ENV=prod");
  }
  const ingestionUrl = parseUrl("VITE_INGESTION_URL", read(env, "VITE_INGESTION_URL") ?? DEFAULT_INGESTION_URL);
  const caseAuditUrl = parseUrl("VITE_CASE_AUDIT_URL", read(env, "VITE_CASE_AUDIT_URL") ?? DEFAULT_CASE_AUDIT_URL);
  const domain = read(env, "VITE_DOMAIN") ?? "mbg";
  return { appEnv, demoMode, ingestionUrl, caseAuditUrl, domain };
}
