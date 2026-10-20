"use client";

import { type FirebaseApp, getApps, initializeApp } from "firebase/app";
import {
  browserLocalPersistence,
  browserSessionPersistence,
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  getAuth,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
} from "firebase/auth";
import { TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useId, useRef, useState } from "react";
import type { AuthConfig } from "@/lib/config";
import { useT } from "@/lib/i18n/client";

function firebaseAuth(config: AuthConfig) {
  const app: FirebaseApp =
    getApps()[0] ?? initializeApp({ apiKey: config.apiKey, authDomain: config.authDomain, projectId: config.projectId });
  const auth = getAuth(app);
  if (config.emulatorUrl && !(auth as unknown as { emulatorConfig?: unknown }).emulatorConfig) {
    connectAuthEmulator(auth, config.emulatorUrl, { disableWarnings: true });
  }
  return auth;
}

/**
 * Email + password sign-in (Identity Platform; the Firebase Auth emulator locally), SCR-023 / SCR-063: the error
 * callout and field message of the "gagal" state, "remember this device" (browser-session cookie when unticked) and
 * the password reset dialog (PRV-password, PRV-password-sent).
 */
export function LoginForm({
  auth: config,
  next,
  allowSignup = false,
  initialSignup = false,
  emailLabel,
}: {
  auth: AuthConfig;
  next: string;
  allowSignup?: boolean;
  /** Start in "create account" mode (the organisation registration link of SCR-063). */
  initialSignup?: boolean;
  /** Label of the email field, e.g. "Email resmi organisasi" on SCR-063. */
  emailLabel?: string;
}) {
  const router = useRouter();
  const t = useT();
  const id = useId();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [signup, setSignup] = useState(initialSignup);
  const [resetOpen, setResetOpen] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);
  // Until React is attached the form must not submit natively (that would put the password in a URL).
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const remember = form.get("remember") === "on";
    setBusy(true);
    setError(null);
    try {
      const auth = firebaseAuth(config);
      await setPersistence(auth, remember ? browserLocalPersistence : browserSessionPersistence);
      const email = String(form.get("email"));
      const password = String(form.get("password"));
      const credential = signup
        ? await createUserWithEmailAndPassword(auth, email, password)
        : await signInWithEmailAndPassword(auth, email, password);
      const idToken = await credential.user.getIdToken(true);
      const response = await fetch("/api/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ idToken, remember }),
      });
      if (!response.ok) throw new Error("session");
      router.replace(next);
      router.refresh();
    } catch {
      setError(signup ? t("login.error.signup") : t("signin.error.body"));
      setBusy(false);
    }
  }

  const failed = error !== null && !signup;
  return (
    <>
      <form className="form login-form" method="post" onSubmit={onSubmit} data-testid="login-form" aria-busy={busy || undefined}>
        {error ? (
          <div className="callout callout--error login-error" role="alert">
            <TriangleAlert aria-hidden size={20} strokeWidth={2} />
            <div>
              {failed ? <p className="login-error__title">{t("signin.error.title")}</p> : null}
              <p>{error}</p>
            </div>
          </div>
        ) : null}
        <label>
          {emailLabel ?? t("login.email")}
          <input ref={emailRef} name="email" type="email" autoComplete="username" required />
        </label>
        <div className="login-field">
          <label htmlFor={`${id}-password`}>{t("login.password")}</label>
          <input
            id={`${id}-password`}
            name="password"
            type="password"
            autoComplete={signup ? "new-password" : "current-password"}
            required
            aria-invalid={failed || undefined}
            aria-describedby={failed ? `${id}-password-error` : undefined}
          />
          {failed ? (
            <p className="login-field__error" id={`${id}-password-error`}>
              <TriangleAlert aria-hidden size={14} strokeWidth={2} />
              {t("signin.error.field")}
            </p>
          ) : null}
        </div>
        <div className="login-options">
          <label className="login-remember">
            <input type="checkbox" name="remember" />
            {t("signin.remember")}
          </label>
          <button type="button" className="login-forgot" onClick={() => setResetOpen(true)}>
            {t("signin.forgot")}
          </button>
        </div>
        <button type="submit" className="button" disabled={busy || !ready}>
          {busy ? t("login.wait") : signup ? t("login.create") : t("login.submit")}
        </button>
        {allowSignup ? (
          <button type="button" className="button button--secondary" onClick={() => setSignup(!signup)} data-testid="toggle-signup">
            {signup ? t("login.toggle.signin") : t("login.toggle.signup")}
          </button>
        ) : null}
      </form>
      {resetOpen ? (
        <ResetDialog config={config} initialEmail={emailRef.current?.value ?? ""} onClose={() => setResetOpen(false)} />
      ) : null}
    </>
  );
}

/** PRV-password → PRV-password-sent. The answer never reveals whether the account exists. */
function ResetDialog({ config, initialEmail, onClose }: { config: AuthConfig; initialEmail: string; onClose: () => void }) {
  const t = useT();
  const ref = useRef<HTMLDialogElement>(null);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = String(new FormData(event.currentTarget).get("email"));
    setBusy(true);
    try {
      await sendPasswordResetEmail(firebaseAuth(config), email);
    } catch {
      // Same answer whether or not the email is registered.
    }
    setBusy(false);
    setSent(true);
  }

  return (
    <dialog ref={ref} className="login-dialog" aria-labelledby="reset-title" onClose={onClose}>
      {sent ? (
        <>
          <h2 id="reset-title">{t("signin.reset.sentTitle")}</h2>
          <p>{t("signin.reset.sentBody")}</p>
          <div className="login-dialog__actions">
            <button type="button" className="button button--secondary" onClick={() => ref.current?.close()}>
              {t("signin.reset.close")}
            </button>
            <button type="button" className="button" onClick={() => ref.current?.close()}>
              {t("signin.reset.back")}
            </button>
          </div>
        </>
      ) : (
        <form method="dialog" onSubmit={onSubmit}>
          <h2 id="reset-title">{t("signin.reset.title")}</h2>
          <p>{t("signin.reset.body")}</p>
          <label className="login-dialog__field">
            {t("signin.reset.email")}
            <input name="email" type="email" autoComplete="username" required defaultValue={initialEmail} />
          </label>
          <div className="login-dialog__actions">
            <button type="button" className="button button--secondary" onClick={() => ref.current?.close()}>
              {t("signin.reset.cancel")}
            </button>
            <button type="submit" className="button" disabled={busy}>
              {t("signin.reset.continue")}
            </button>
          </div>
        </form>
      )}
    </dialog>
  );
}
