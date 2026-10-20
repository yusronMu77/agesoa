import Link from "next/link";
import type { ReactNode } from "react";
import { LanguagePicker } from "@/components/shell/LanguagePicker";
import { Logo } from "@/components/shell/Logo";
import { SimulationBand } from "@/components/SimulationBand";
import { RegistrationMobileStep, RegistrationStepProvider, RegistrationSteps } from "./RegistrationSteps";
import { loadConfig } from "@/lib/config";
import { getT } from "@/lib/i18n/server";

export type RegistrationFlow = "validator" | "organization";

/**
 * Full-page registration (agesoa-uiux "Registration", SCR-021/024–026 validator, SCR-060/064/065 organization):
 * ink guide on the left with the promise, the steps and a note; the 640 px form column on the right with
 * "Registrasi …" and the sign-in link above it. Phones get a short header ("Validator · Langkah 1 dari 4").
 */
export async function RegistrationShell({
  flow,
  step,
  signInHref,
  children,
}: {
  flow: RegistrationFlow;
  /** Zero-based index of the current step. */
  step: number;
  signInHref: string;
  children: ReactNode;
}) {
  const { t } = await getT();
  // Organizations are always simulated in the prototype; validators only under demo_mode (as in the console).
  const band = flow === "organization" || loadConfig().demoMode;
  const steps =
    flow === "validator"
      ? [t("reg.step1"), t("reg.step2"), t("reg.step3"), t("reg.step4")]
      : [t("org.step1"), t("org.step2"), t("org.step3")];
  const prefix = flow === "validator" ? "reg" : "org";
  return (
    <RegistrationStepProvider key={step} initial={step}>
    <div className="shell shell--register">
      {band ? <SimulationBand variant="org" /> : null}
      <div className="register-body">
        <aside className="register-guide" aria-label={t(`${prefix}.guide.aria`)}>
          <div className="register-guide__top">
            <Logo href="/" />
            <p className="register-guide__title">{t(`${prefix}.guide.title`)}</p>
            <p className="register-guide__intro">{t(`${prefix}.guide.intro`)}</p>
            <RegistrationSteps labels={steps} states={{ done: t("step.done"), current: t("step.current"), next: t("step.next") }} />
          </div>
          <p className="register-guide__foot">
            {flow === "validator" ? t("reg.guide.privacyTitle") : t("org.guide.footTitle")}
            <br />
            {flow === "validator" ? t("reg.guide.privacy") : t("org.guide.foot")}
          </p>
        </aside>
        <div className="register-panel">
          <header className="register-mobile">
            <p className="register-mobile__brand">AGESOA</p>
            <RegistrationMobileStep template={t(`${prefix}.mobileStep`, { n: "{n}", total: steps.length })} />
          </header>
          <div className="register-nav">
            <p className="register-nav__flow">{t(`${prefix}.flow`)}</p>
            <div className="register-nav__tools">
              <LanguagePicker />
              <Link href={signInHref} className="button button--ghost">
                {t("login.submit")}
              </Link>
            </div>
          </div>
          <main id="main" className="register-main" tabIndex={-1}>
            {children}
          </main>
        </div>
      </div>
    </div>
    </RegistrationStepProvider>
  );
}

/** Title + lead of a registration view (Display/2XL desktop, Heading/XL phone). */
export function RegistrationHead({ title, lead, testId }: { title: string; lead: string; testId?: string }) {
  return (
    <div className="register-head" data-testid={testId}>
      <h1>{title}</h1>
      <p>{lead}</p>
    </div>
  );
}

/** One status line of SCR-026/065: icon, strong title, secondary detail. */
export function RegistrationRow({ icon, title, detail }: { icon: ReactNode; title: ReactNode; detail: ReactNode }) {
  return (
    <li className="register-row">
      <span className="register-row__icon" aria-hidden="true">
        {icon}
      </span>
      <span className="register-row__text">
        <strong>{title}</strong>
        <span>{detail}</span>
      </span>
    </li>
  );
}
