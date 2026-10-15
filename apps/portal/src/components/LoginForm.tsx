"use client";

import { getApps, initializeApp } from "firebase/app";
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth, signInWithEmailAndPassword } from "firebase/auth";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";
import type { AuthConfig } from "@/lib/config";

/** Email + password sign-in (Identity Platform; the Firebase Auth emulator locally). */
export function LoginForm({ auth: config, next, allowSignup = false }: { auth: AuthConfig; next: string; allowSignup?: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [signup, setSignup] = useState(false);
  // Until React is attached the form must not submit natively (that would put the password in a URL).
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    try {
      const app = getApps()[0] ?? initializeApp({ apiKey: config.apiKey, authDomain: config.authDomain, projectId: config.projectId });
      const auth = getAuth(app);
      if (config.emulatorUrl && !(auth as unknown as { emulatorConfig?: unknown }).emulatorConfig) {
        connectAuthEmulator(auth, config.emulatorUrl, { disableWarnings: true });
      }
      const email = String(form.get("email"));
      const password = String(form.get("password"));
      const credential = signup
        ? await createUserWithEmailAndPassword(auth, email, password)
        : await signInWithEmailAndPassword(auth, email, password);
      const idToken = await credential.user.getIdToken(true);
      const response = await fetch("/api/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ idToken }),
      });
      if (!response.ok) throw new Error("session");
      router.replace(next);
      router.refresh();
    } catch {
      setError(signup ? "Could not create the account (email in use, or password shorter than 6 characters)." : "Sign-in failed. Check the email and password.");
      setBusy(false);
    }
  }

  return (
    <form className="card form" method="post" onSubmit={onSubmit} data-testid="login-form">
      <label>
        Email
        <input name="email" type="email" autoComplete="username" required />
      </label>
      <label>
        Password
        <input name="password" type="password" autoComplete="current-password" required />
      </label>
      {error ? (
        <p className="callout callout--error" role="alert">
          {error}
        </p>
      ) : null}
      <button type="submit" className="button" disabled={busy || !ready}>
        {busy ? "Please wait…" : signup ? "Create account" : "Sign in"}
      </button>
      {allowSignup ? (
        <button type="button" className="button button--secondary" onClick={() => setSignup(!signup)} data-testid="toggle-signup">
          {signup ? "I already have an account" : "New here? Create an account"}
        </button>
      ) : null}
    </form>
  );
}
