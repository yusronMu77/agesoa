/**
 * Firebase anonymous sign-in. Loaded on demand by auth.ts.
 *
 * Inside the Android app the Auth instance must be built with `initializeAuth` and IndexedDB persistence;
 * `getAuth` picks a popup/redirect resolver that stalls in a Capacitor WebView. The browser uses `getAuth`.
 */

import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, indexedDBLocalPersistence, initializeAuth, signInAnonymously, type Auth } from "firebase/auth";
import type { FirebaseConfig } from "./config";
import { isNative } from "./native";

let auth: Auth | null = null;

function app(config: FirebaseConfig): FirebaseApp {
  return getApps().length ? getApp() : initializeApp(config);
}

export function authFor(config: FirebaseConfig, native: boolean = isNative()): Auth {
  if (!auth) {
    const instance = app(config);
    auth = native ? initializeAuth(instance, { persistence: indexedDBLocalPersistence }) : getAuth(instance);
  }
  return auth;
}

/** ID token of the persisted anonymous user; signs in once when there is none yet. */
export async function anonymousIdToken(config: FirebaseConfig): Promise<string> {
  const instance = authFor(config);
  await instance.authStateReady();
  const user = instance.currentUser ?? (await signInAnonymously(instance)).user;
  return user.getIdToken();
}
