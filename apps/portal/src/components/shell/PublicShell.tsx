import { clerkEnabled } from "@/lib/clerk-config";
import { sessionToken } from "@/lib/session";
import { PublicAuth } from "./PublicAuth";
import { Users } from "lucide-react";
import type { ReactNode } from "react";
import { NavLink } from "@/components/NavLink";
import { SimulationBand } from "@/components/SimulationBand";
import { loadConfig } from "@/lib/config";
import { getT } from "@/lib/i18n/server";
import { LanguagePicker } from "./LanguagePicker";
import { Logo } from "./Logo";

/** Public dashboard shell (SCR-040–043): ink header with the reader's sections only, content width 1280. */
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
                <NavLink href="/dashboard" also={["/", "/cases"]}>
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
            <LanguagePicker tone="ink" />
            <span className="role-chip role-chip--public">
              <Users aria-hidden size={14} strokeWidth={2} />
              {t("common.role.public")}
            </span>
            <PublicAuth clerk={clerkEnabled()} legacySignedIn={signedIn} />
          </div>
        </div>
      </header>
      <main id="main" className="public-main" tabIndex={-1}>
        {children}
      </main>
      <footer className="public-footer">
        <div className="public-footer__inner">
          <p>
            {t("common.footer.portal")} · {t("common.footer.release")} <span className="mono">{config.release}</span> ·{" "}
            {t("common.footer.env")} <span className="mono">{config.appEnv}</span>
          </p>
          <p className="public-footer__links">
            <a href="/validate">{t("public.nav.forValidators")}</a>
            <a href="/organizations">{t("public.nav.forInstitutions")}</a>
          </p>
        </div>
      </footer>
    </div>
  );
}
