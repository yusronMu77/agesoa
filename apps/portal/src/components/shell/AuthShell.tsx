import { CircleCheck } from "lucide-react";
import type { ReactNode } from "react";
import { SimulationBand } from "@/components/SimulationBand";
import { loadConfig } from "@/lib/config";
import { getT } from "@/lib/i18n/server";
import { LanguagePicker } from "./LanguagePicker";
import { Logo } from "./Logo";

/**
 * Sign-in layout of a signed-in surface (SCR-023 validator, SCR-063 institution, operator): ink panel with what the
 * surface is for and its promises, the form on the right. `points` are already translated.
 */
export async function AuthShell({
  surfaceTitle,
  intro,
  points,
  band = "org",
  children,
}: {
  band?: "data" | "org";
  surfaceTitle: string;
  intro: string;
  points: string[];
  children: ReactNode;
}) {
  const { t } = await getT();
  const demo = loadConfig().demoMode;
  return (
    <div className="shell shell--auth">
      {demo ? <SimulationBand variant={band} /> : null}
      <aside className="auth-panel">
        <Logo />
        <p className="auth-panel__title">{surfaceTitle}</p>
        <p className="auth-panel__intro">{intro}</p>
        <ul className="auth-panel__points">
          {points.map((point) => (
            <li key={point}>
              <CircleCheck aria-hidden size={20} strokeWidth={2} />
              {point}
            </li>
          ))}
        </ul>
      </aside>
      <div className="auth-body">
        <div className="auth-body__tools">
          <LanguagePicker />
        </div>
        <main id="main" className="auth-main" tabIndex={-1}>
          {children}
        </main>
        <p className="auth-body__privacy">{t("common.footer.privacy")}</p>
      </div>
    </div>
  );
}
