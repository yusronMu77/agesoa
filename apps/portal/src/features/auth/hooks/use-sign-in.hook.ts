"use client";

import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from "firebase/auth";
import { useCallback, useState } from "react";
import type { AuthConfig } from "@/configs/env.config";
import { createSession, firebaseAuth } from "../lib/firebase-client";

export interface Credentials {
  email: string;
  password: string;
  /** Create the account instead of signing in (validator registration only). */
  signup: boolean;
}

const ERROR_TEXT = {
  signIn: "Sign-in failed. Check the email and password.",
  signup: "Could not create the account (email in use, or password shorter than 6 characters).",
};

/**
 * Email + password sign-in that ends with a session cookie. `busy` stays true after success so the form stays
 * locked while the page navigates away.
 */
export function useSignIn(config: AuthConfig) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const signIn = useCallback(
    async ({ email, password, signup }: Credentials): Promise<boolean> => {
      setBusy(true);
      setError(null);
      try {
        const auth = firebaseAuth(config);
        const credential = signup
          ? await createUserWithEmailAndPassword(auth, email, password)
          : await signInWithEmailAndPassword(auth, email, password);
        await createSession(await credential.user.getIdToken(true));
        return true;
      } catch {
        setError(signup ? ERROR_TEXT.signup : ERROR_TEXT.signIn);
        setBusy(false);
        return false;
      }
    },
    [config],
  );

  return { signIn, error, busy };
}
