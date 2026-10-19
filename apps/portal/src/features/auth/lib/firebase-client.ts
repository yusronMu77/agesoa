/** Browser side of sign-in: Firebase Auth (Identity Platform; the emulator locally) and the session cookie. */

import { getApps, initializeApp } from "firebase/app";
import { type Auth, connectAuthEmulator, getAuth } from "firebase/auth";
import type { AuthConfig } from "@/configs/env.config";
import { ROUTES } from "@/configs/routes.config";

/** The Firebase Auth instance, created once per page and connected to the emulator when one is configured. */
export function firebaseAuth(config: AuthConfig): Auth {
  const app = getApps()[0] ?? initializeApp({ apiKey: config.apiKey, authDomain: config.authDomain, projectId: config.projectId });
  const auth = getAuth(app);
  if (config.emulatorUrl && !(auth as unknown as { emulatorConfig?: unknown }).emulatorConfig) {
    connectAuthEmulator(auth, config.emulatorUrl, { disableWarnings: true });
  }
  return auth;
}

/** Hands the ID token to the portal, which keeps it in the httpOnly session cookie. */
export async function createSession(idToken: string): Promise<void> {
  const response = await fetch(ROUTES.api.session, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ idToken }),
  });
  if (!response.ok) throw new Error("session");
}
