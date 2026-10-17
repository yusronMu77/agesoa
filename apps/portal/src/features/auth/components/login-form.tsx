"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import type { AuthConfig } from "@/configs/env.config";
import { useHydrated } from "@/hooks/use-hydrated.hook";
import { useSignIn } from "../hooks/use-sign-in.hook";

/** Email + password sign-in (Identity Platform; the Firebase Auth emulator locally). */
export function LoginForm({ auth, next, allowSignup = false }: { auth: AuthConfig; next: string; allowSignup?: boolean }) {
  const router = useRouter();
  const { signIn, error, busy } = useSignIn(auth);
  const [signup, setSignup] = useState(false);
  // Until React is attached the form must not submit natively (that would put the password in a URL).
  const ready = useHydrated();

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const ok = await signIn({ email: String(form.get("email")), password: String(form.get("password")), signup });
    if (!ok) return;
    router.replace(next);
    router.refresh();
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
        <Callout tone="error" role="alert">
          {error}
        </Callout>
      ) : null}
      <Button disabled={busy || !ready}>{busy ? "Please wait…" : signup ? "Create account" : "Sign in"}</Button>
      {allowSignup ? (
        <Button type="button" variant="secondary" onClick={() => setSignup(!signup)} data-testid="toggle-signup">
          {signup ? "I already have an account" : "New here? Create an account"}
        </Button>
      ) : null}
    </form>
  );
}
