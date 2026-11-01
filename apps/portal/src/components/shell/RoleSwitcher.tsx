"use client";

import { useClerk } from "@clerk/nextjs";
import { getApps } from "firebase/app";
import { getAuth, signOut as firebaseSignOut } from "firebase/auth";
import { Building2, ChevronDown, LogIn, LogOut, Settings, ShieldCheck, UserPlus, Users, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { useT } from "@/lib/i18n/client";
import { ROLE_ENTRIES, type SwitchRole } from "@/lib/role-switch";

const ROLE_ICON: Record<SwitchRole, LucideIcon> = {
  public: Users,
  validator: ShieldCheck,
  institution: Building2,
  ops: Settings,
};

/**
 * The public header's Role chip ("Publik", components.md) as a role switcher: it opens a native popover listing the
 * four surfaces. The public surface is marked as the current one; validator, organisation and operator each offer
 * their own two ways in, sign-in or registration. Works without JavaScript (popover + plain links). A reader signed in
 * on the public surface signs out here (this replaces the former header sign-in button).
 */
export function RoleSwitcher({ signedIn, clerk }: { signedIn: boolean; clerk: boolean }) {
  const t = useT();
  const id = useId();
  const popover = `${id}-roles`;
  const title = `${id}-title`;
  return (
    <div className="role-switch" data-testid="role-switch">
      {/* Accessible name keeps the visible text (WCAG 2.5.3): "Ganti peran Publik". */}
      <button type="button" className="role-chip role-chip--public role-switch__trigger" popoverTarget={popover}>
        {/* Icons sized like the language picker's next to it (globe 18, chevron 16). */}
        <Users aria-hidden size={18} strokeWidth={2} />
        <span className="sr-only">{t("common.roleSwitch.trigger")} </span>
        <span>{t("common.role.public")}</span>
        <ChevronDown aria-hidden size={16} strokeWidth={2} />
      </button>
      <div id={popover} popover="auto" role="dialog" aria-labelledby={title} className="role-dialog">
        <h2 id={title}>{t("common.roleSwitch.title")}</h2>
        <p className="role-dialog__body">{t("common.roleSwitch.body")}</p>
        <ul className="role-dialog__list">
          {ROLE_ENTRIES.map((entry) => {
            const Icon = ROLE_ICON[entry.role];
            const role = t(entry.label);
            return (
              <li key={entry.role} className="role-option" data-role={entry.role}>
                <span className={`role-chip role-chip--${entry.role}`}>
                  <Icon aria-hidden size={14} strokeWidth={2} />
                  {role}
                </span>
                {entry.signIn && entry.register ? (
                  <span className="role-option__actions">
                    <Link
                      href={entry.signIn}
                      className="button role-dialog__button"
                      aria-label={t("common.roleSwitch.signInAs", { role })}
                      data-testid={`role-signin-${entry.role}`}
                    >
                      <LogIn aria-hidden size={16} strokeWidth={2} />
                      {t("common.roleSwitch.signIn")}
                    </Link>
                    <Link
                      href={entry.register}
                      className="button button--secondary role-dialog__button"
                      aria-label={t("common.roleSwitch.registerAs", { role })}
                      data-testid={`role-register-${entry.role}`}
                    >
                      <UserPlus aria-hidden size={16} strokeWidth={2} />
                      {t("common.roleSwitch.register")}
                    </Link>
                  </span>
                ) : (
                  <span className="role-option__current" aria-current="page">
                    {t("common.roleSwitch.current")}
                  </span>
                )}
                {entry.note ? <p className="role-option__note">{t(entry.note)}</p> : null}
              </li>
            );
          })}
        </ul>
        <div className="role-dialog__footer">
          {signedIn ? clerk ? <ClerkSignOut /> : <SignOut /> : null}
          <button type="button" className="button button--secondary role-dialog__button" popoverTarget={popover} popoverTargetAction="hide">
            {t("common.roleSwitch.close")}
          </button>
        </div>
      </div>
    </div>
  );
}

function ClerkSignOut() {
  const { signOut } = useClerk();
  return <SignOut onClerkSignOut={() => signOut()} />;
}

/** Clears the portal session (and the Firebase / Clerk client sessions), then reloads the public page. */
function SignOut({ onClerkSignOut }: { onClerkSignOut?: () => Promise<unknown> }) {
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
  return (
    <>
      <button type="button" className="button button--secondary role-dialog__button" onClick={logout} disabled={busy} aria-busy={busy || undefined} data-testid="role-signout">
        <LogOut aria-hidden size={16} strokeWidth={2} />
        {busy ? t("common.loading") : t("common.signOut")}
      </button>
      {failed ? (
        <span role="alert" className="role-dialog__error">
          {t("common.signOutError")}
        </span>
      ) : null}
    </>
  );
}
