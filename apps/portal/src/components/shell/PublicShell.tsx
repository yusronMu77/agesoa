import { clerkEnabled } from "@/lib/clerk-config";
import { sessionToken } from "@/lib/session";
import type { ReactNode } from "react";
import { NavLink } from "@/components/NavLink";
import { SimulationBand } from "@/components/SimulationBand";
import { loadConfig } from "@/lib/config";
import { getLangPreference, getT } from "@/lib/i18n/server";
import { ROUTES } from "@/lib/routes";
import { LanguagePicker } from "./LanguagePicker";
import { Logo } from "./Logo";
import { RoleSwitcher } from "./RoleSwitcher";

/**
 * Public dashboard shell (SCR-040–043): simulation band, ink header with the reader's sections only, content width
 * 1280. Like the design there is no footer. The Role chip switches to the validator, organisation and operator
 * surfaces (their sign-in or registration pages); the About page links them too.
 */
export async function PublicShell({ children }: { children: ReactNode }) {
  const { t } = await getT();
  const config = loadConfig();
  const signedIn = (await sessionToken()) !== null;
  return (
    <div className="shell shell--public">
      {config.demoMode ? <SimulationBand /> : null}
      <header className="public-header">
        <div className="public-header__inner">
          <Logo />
          <nav className="public-nav" aria-label={t("nav.main")}>
            <ul>
              <li>
                <NavLink href={ROUTES.home} also={["/temuan"]}>
                  {t("public.nav.findings")}
                </NavLink>
              </li>
              <li>
                <NavLink href="/log">{t("public.nav.log")}</NavLink>
              </li>
              <li>
                <NavLink href="/about">{t("public.nav.about")}</NavLink>
              </li>
            </ul>
          </nav>
          <div className="public-header__tools">
            <LanguagePicker tone="ink" preference={await getLangPreference()} />
            <RoleSwitcher signedIn={signedIn} clerk={clerkEnabled()} />
          </div>
        </div>
      </header>
      <main id="main" className="public-main" tabIndex={-1}>
        {children}
      </main>
    </div>
  );
}
