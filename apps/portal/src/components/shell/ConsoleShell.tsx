import {
  Activity,
  Bell,
  Building2,
  CircleCheck,
  FileText,
  Hash,
  Inbox,
  LayoutGrid,
  List,
  LogOut,
  type LucideIcon,
  Send,
  Settings,
  ShieldCheck,
  Tablet,
  GitBranch,
  UsersRound,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { SimulationBand } from "@/components/SimulationBand";
import { loadConfig } from "@/lib/config";
import { getT } from "@/lib/i18n/server";
import { ROUTES } from "@/lib/routes";
import { sessionToken } from "@/lib/session";
import { LanguagePicker } from "./LanguagePicker";
import { Logo } from "./Logo";

export type ConsoleSurface = "validator" | "institution" | "ops";

/** Icons of the console navigation by name, so pages can describe their sidebar without importing lucide. */
export const CONSOLE_ICONS = {
  queue: LayoutGrid,
  decisions: CircleCheck,
  log: Hash,
  role: UsersRound,
  inbox: Inbox,
  staff: UsersRound,
  reply: Send,
  integration: Activity,
  register: FileText,
  profile: Tablet,
  organizations: Building2,
  machine: Activity,
  events: Inbox,
  outbox: List,
  demo: GitBranch,
} satisfies Record<string, LucideIcon>;

export interface ConsoleNavItem {
  href: string;
  label: string;
  icon: keyof typeof CONSOLE_ICONS;
  current?: boolean;
}

/** Who is signed in, without a person's name (agesoa-uiux "Identitas" card at the bottom of the sidebar). */
export interface ConsoleIdentity {
  title: ReactNode;
  sub?: ReactNode;
  /** Extra content inside the card (status badge, screen-reader details). */
  extra?: ReactNode;
  testId?: string;
}

const ROLE_ICON: Record<ConsoleSurface, LucideIcon> = { validator: ShieldCheck, institution: Tablet, ops: Settings };

/** Signing out of a console returns to that surface's own sign-in page. */
const SIGN_OUT_TO: Record<ConsoleSurface, string> = {
  validator: ROUTES.validatorSignIn,
  institution: ROUTES.institutionSignIn,
  ops: ROUTES.opsSignIn,
};

/**
 * Shell of the signed-in surfaces (SCR-020/022 validator, SCR-060–062 institution, SCR-090 operator): sidebar with
 * logo, role chip, the surface's sections and the identity card; topbar with the context selectors of the page, the
 * language picker and the notifications link. Each page renders the shell itself, because the context selectors,
 * the current section and the identity depend on the page's data.
 */
export async function ConsoleShell({
  surface,
  nav,
  role,
  context,
  identity,
  home,
  children,
}: {
  surface: ConsoleSurface;
  nav: ConsoleNavItem[];
  /** Role chip text ("Validator", "Redaksi", "Instansi", "Operator"). */
  role: string;
  /** Topbar context selectors (ConsoleContext). */
  context?: ReactNode;
  identity?: ConsoleIdentity;
  /** Where the logo and the notifications link lead. */
  home: string;
  children: ReactNode;
}) {
  const { t } = await getT();
  const signedIn = (await sessionToken()) !== null;
  const RoleIcon = ROLE_ICON[surface];
  // Organizations are always simulated in the prototype; validators and operators only under demo_mode.
  const demo = loadConfig().demoMode;
  const band = surface === "institution" || (surface === "validator" && demo) ? "org" : demo ? "data" : null;
  const IdentityIcon = ROLE_ICON[surface];
  return (
    <div className={`shell shell--console shell--${surface}`}>
      {band ? <SimulationBand variant={band} /> : null}
      <aside className="console-sidebar">
        <Logo href={home} />
        <span className={`role-chip role-chip--${surface}`}>
          <RoleIcon aria-hidden size={14} strokeWidth={2} />
          {role}
        </span>
        <nav className="console-nav" aria-label={t("nav.console", { surface: role })}>
          <ul>
            {nav.map(({ href, label, icon, current }) => {
              const Icon = CONSOLE_ICONS[icon];
              return (
                <li key={`${href}-${label}`}>
                  <Link href={href} aria-current={current ? "page" : undefined}>
                    <Icon aria-hidden size={20} strokeWidth={1.75} />
                    {label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        {identity || signedIn ? (
          <div className="console-identity" data-testid={identity?.testId}>
            <span className={`console-identity__icon console-identity__icon--${surface}`} aria-hidden="true">
              <IdentityIcon size={22} strokeWidth={1.75} />
            </span>
            <div className="console-identity__body">
              {identity ? (
                <>
                  <p className="console-identity__title">{identity.title}</p>
                  {identity.sub ? <p className="console-identity__sub">{identity.sub}</p> : null}
                  {identity.extra}
                </>
              ) : (
                <p className="console-identity__title">{role}</p>
              )}
            </div>
            {signedIn ? (
              <form method="post" action={`${ROUTES.signOut}?to=${encodeURIComponent(SIGN_OUT_TO[surface])}`} className="console-identity__out">
                <button type="submit" className="console-signout" title={t("common.signOut")}>
                  <LogOut aria-hidden size={18} strokeWidth={2} />
                  <span className="sr-only">{t("common.signOut")}</span>
                </button>
              </form>
            ) : null}
          </div>
        ) : null}
      </aside>
      <div className="console-body">
        <header className="console-topbar">
          <div className="console-topbar__context">{context}</div>
          <div className="console-topbar__tools">
            <LanguagePicker />
            <Link href={home} className="console-bell" title={t("console.notifications")}>
              <Bell aria-hidden size={20} strokeWidth={1.75} />
              <span className="sr-only">{t("console.notifications")}</span>
            </Link>
          </div>
        </header>
        <main id="main" className="console-main" tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  );
}
