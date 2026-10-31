/**
 * Firebase anonymous sign-in. Loaded on demand by auth.ts.
 *
 * Inside the Android app the Auth instance must be built with `initializeAuth` and IndexedDB persistence;
 * `getAuth` picks a popup/redirect resolver that stalls in a Capacitor WebView. The browser uses `getAuth`.
 */

import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, indexedDBLocalPersistence, initializeAuth, signInAnonymously, type Auth, type UserCredential } from "firebase/auth";
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

/** The sign-in in flight: requests that start together (regions, draft, ...) must share it. */
let signingIn: Promise<UserCredential> | null = null;

/**
 * ID token of the persisted anonymous user; signs in once when there is none yet. Every `signInAnonymously` makes a
 * new user, so concurrent first requests that each signed in would put a report under one uid and ask for its audit
 * questions under another.
 */
export async function anonymousIdToken(config: FirebaseConfig): Promise<string> {
  const instance = authFor(config);
  await instance.authStateReady();
  signingIn ??= instance.currentUser
    ? null
    : signInAnonymously(instance).finally(() => {
        signingIn = null;
      });
  const user = instance.currentUser ?? (await signingIn)!.user;
  return user.getIdToken();
}
