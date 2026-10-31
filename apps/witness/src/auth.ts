/**
 * Anonymous reporter session. Witness never asks for a name, phone number or e-mail: the device keeps a random
 * id, and the services only ever see a pseudonym of it. Reports and their status are visible to this device only.
 *
 * Local runs use the services' development token (`dev:<id>`, accepted in `local`/`test` only). Deployed
 * environments (web and the Android app) sign in anonymously with Firebase Auth and send its ID token.
 */

import type { AppEnv, WitnessConfig } from "./config";

const DEVICE_KEY = "agesoa.witness.device";

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function memoryStore(): KeyValueStore {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => void values.set(key, value),
  };
}

export function defaultStore(): KeyValueStore {
  try {
    const store = globalThis.localStorage;
    store.getItem(DEVICE_KEY);
    return store;
  } catch {
    return memoryStore(); // private mode / storage blocked: one session only
  }
}

export function deviceId(store: KeyValueStore = defaultStore()): string {
  let id = store.getItem(DEVICE_KEY);
  if (!id || !/^[a-z0-9-]{16,64}$/.test(id)) {
    id = crypto.randomUUID();
    store.setItem(DEVICE_KEY, id);
  }
  return id;
}

/** The development token; only the `local` environment accepts it. */
export function bearerToken(appEnv: AppEnv, store?: KeyValueStore): string {
  if (appEnv !== "local") {
    throw new Error(`the development token is only accepted in local, not ${appEnv}`);
  }
  return `dev:${deviceId(store)}`;
}

export type IdTokenProvider = (config: NonNullable<WitnessConfig["firebase"]>) => Promise<string>;

/** Firebase loads on first use, so a local run never downloads it. */
const firebaseIdToken: IdTokenProvider = async (config) => (await import("./firebase")).anonymousIdToken(config);

/** The bearer token for a request: the dev token in `local`, otherwise the Firebase anonymous ID token. */
export async function authToken(
  config: WitnessConfig,
  store?: KeyValueStore,
  idToken: IdTokenProvider = firebaseIdToken,
): Promise<string> {
  if (config.appEnv === "local") return bearerToken(config.appEnv, store);
  if (!config.firebase) throw new Error(`Firebase settings are missing for ${config.appEnv}`);
  return idToken(config.firebase);
}
