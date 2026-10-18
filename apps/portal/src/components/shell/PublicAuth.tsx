"use client";

import { SignInButton, useAuth, useClerk } from "@clerk/nextjs";
import { getApps } from "firebase/app";
import { getAuth, signOut as firebaseSignOut } from "firebase/auth";
import { LogIn, LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useT } from "@/lib/i18n/client";

/** A public Clerk session does not grant validator, institution, or operator privileges. */
export function PublicAuth({ clerk, legacySignedIn }: { clerk: boolean; legacySignedIn: boolean }) {
  return clerk ? <ClerkAuth legacySignedIn={legacySignedIn} /> : <SessionControl signedIn={legacySignedIn} />;
}

function ClerkAuth({ legacySignedIn }: { legacySignedIn: boolean }) {
  const { isLoaded, isSignedIn } = useAuth();
  const { signOut } = useClerk();
  const t = useT();
  if (!isLoaded) return <button className="public-auth" disabled aria-busy="true">{t("common.loading")}</button>;
  if (isSignedIn || legacySignedIn) return <SessionControl signedIn onClerkSignOut={isSignedIn ? () => signOut() : undefined} />;
  return <SignInButton mode="modal" forceRedirectUrl="/dashboard"><button className="public-auth"><LogIn size={16} aria-hidden />{t("common.signIn")}</button></SignInButton>;
}

function SessionControl({ signedIn, onClerkSignOut }: { signedIn: boolean; onClerkSignOut?: () => Promise<unknown> }) {
  const t = useT();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  async function logout() {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    try {
      const response = await fetch("/api/session", { method: "DELETE" });
      if (!response.ok) throw new Error("sign out failed");
      await Promise.all(getApps().map((app) => firebaseSignOut(getAuth(app))));
      await onClerkSignOut?.();
      router.refresh();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }
  return <div className="public-auth-wrap">
    {signedIn ? <button className="public-auth" onClick={logout} disabled={busy} aria-busy={busy || undefined}><LogOut size={16} aria-hidden />{busy ? t("common.loading") : t("common.signOut")}</button>
      : <a className="public-auth" href="/login?next=/dashboard"><LogIn size={16} aria-hidden />{t("common.signIn")}</a>}
    {failed ? <span role="alert" className="public-auth-error">{t("common.signOutError")}</span> : null}
  </div>;
}
