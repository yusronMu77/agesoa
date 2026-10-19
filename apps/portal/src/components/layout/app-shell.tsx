import type { ReactNode } from "react";
import type { PortalConfig } from "@/configs/env.config";
import { SimulationBand } from "@/components/shared/simulation-band";
import { SiteFooter } from "./site-footer";
import { SiteHeader } from "./site-header";

/** Frame of every page: skip link, SIMULASI band in demo mode, header, main landmark, footer. */
export function AppShell({ config, children }: { config: PortalConfig; children: ReactNode }) {
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to main content
      </a>
      {config.demoMode ? <SimulationBand /> : null}
      <SiteHeader />
      <main id="main" className="site-main" tabIndex={-1}>
        {children}
      </main>
      <SiteFooter release={config.release} appEnv={config.appEnv} />
    </>
  );
}
