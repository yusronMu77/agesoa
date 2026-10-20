import { ArrowLeft, Building2, Gauge, Hash, LayoutGrid, LogOut, type LucideIcon, Server, ShieldCheck, UserRound, Wrench } from "lucide-react";
import type { ReactNode } from "react";
import { NavLink } from "@/components/NavLink";
import { SimulationBand } from "@/components/SimulationBand";
import { loadConfig } from "@/lib/config";
import type { MessageKey } from "@/lib/i18n/messages";
import { getT } from "@/lib/i18n/server";
import { sessionToken } from "@/lib/session";
import { LanguagePicker } from "./LanguagePicker";
import { Logo } from "./Logo";

export type ConsoleSurface = "validator" | "institution" | "ops";

interface NavItem {
  href: string;
  label: MessageKey;
  icon: LucideIcon;
  also?: string[];
}

const SURFACES: Record<ConsoleSurface, { role: MessageKey; title: MessageKey; icon: LucideIcon; home: string; nav: NavItem[] }> = {
  validator: {
    role: "common.role.validator",
    title: "console.validator.title",
    icon: ShieldCheck,
    home: "/validate",
    nav: [
      { href: "/validate", label: "console.validator.nav.queue", icon: LayoutGrid },
      { href: "/validators/register", label: "console.validator.nav.register", icon: UserRound },
      { href: "/log", label: "console.validator.nav.log", icon: Hash },
    ],
  },
  institution: {
    role: "common.role.institution",
    title: "console.institution.title",
    icon: Building2,
    home: "/organizations",
    nav: [
      { href: "/organizations", label: "console.institution.nav.organizations", icon: Building2 },
      { href: "/log", label: "console.institution.nav.log", icon: Hash },
    ],
  },
  ops: {
    role: "common.role.operator",
    title: "console.ops.title",
    icon: Wrench,
    home: "/ops",
    nav: [
      { href: "/ops", label: "console.ops.nav.ops", icon: Gauge },
      { href: "/status", label: "console.ops.nav.status", icon: Server },
      { href: "/log", label: "console.ops.nav.log", icon: Hash },
    ],
  },
};

/**
 * Shell of the signed-in surfaces (SCR-020–026 validator, SCR-060–065 institution, SCR-090 operator): sidebar with
 * that surface's sections only + topbar with the language picker. Each surface has its own sign-in page.
 */
export async function ConsoleShell({ surface, children }: { surface: ConsoleSurface; children: ReactNode }) {
  const { t } = await getT();
  const spec = SURFACES[surface];
  const signedIn = (await sessionToken()) !== null;
  const RoleIcon = spec.icon;
  // Organizations are always simulated in the prototype; validators and operators only under demo_mode.
  const demo = loadConfig().demoMode;
  const band = surface === "institution" || (surface === "validator" && demo) ? "org" : demo ? "data" : null;
  return (
    <div className={`shell shell--console shell--${surface}`}>
      {band ? <SimulationBand variant={band} /> : null}
      <aside className="console-sidebar">
        <Logo href={spec.home} />
        <span className={`role-chip role-chip--${surface}`}>
          <RoleIcon aria-hidden size={14} strokeWidth={2} />
          {t(spec.role)}
        </span>
        <nav className="console-nav" aria-label={t("nav.console", { surface: t(spec.title) })}>
          <ul>
            {spec.nav.map(({ href, label, icon: Icon, also }) => (
              <li key={href}>
                <NavLink href={href} also={also}>
                  <Icon aria-hidden size={18} strokeWidth={2} />
                  {t(label)}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <div className="console-sidebar__foot">
          <a href="/dashboard" className="console-back">
            <ArrowLeft aria-hidden size={16} strokeWidth={2} />
            {t("console.backPublic")}
          </a>
          {signedIn ? (
            <form method="post" action="/logout">
              <button type="submit" className="console-signout">
                <LogOut aria-hidden size={16} strokeWidth={2} />
                {t("common.signOut")}
              </button>
            </form>
          ) : null}
        </div>
      </aside>
      <div className="console-body">
        <header className="console-topbar">
          <p className="console-topbar__title">{t(spec.title)}</p>
          <LanguagePicker />
        </header>
        <main id="main" className="console-main" tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  );
}
