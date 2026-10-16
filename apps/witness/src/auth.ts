/**
 * Anonymous reporter session. Witness never asks for a name, phone number or e-mail: the device keeps a random
 * id, and the services only ever see a pseudonym of it. Reports and their status are visible to this device only.
 *
 * Local runs use the services' development token (`dev:<id>`, accepted in `local`/`test` only). Deployed
 * environments will use Firebase anonymous sign-in (issue #23); until then they fail loudly instead of silently
 * sending a token the service refuses.
 */

import type { AppEnv } from "./config";

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

export function bearerToken(appEnv: AppEnv, store?: KeyValueStore): string {
  if (appEnv !== "local") {
    throw new Error(`anonymous sign-in for ${appEnv} is not wired yet (Firebase anonymous auth, issue #23)`);
  }
  return `dev:${deviceId(store)}`;
}
