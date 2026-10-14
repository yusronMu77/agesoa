import "@agesoa/ui/tokens.css";
import "./globals.css";

import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { NavLink } from "@/components/NavLink";
import { SimulationBand } from "@/components/SimulationBand";
import { loadConfig } from "@/lib/config";

// Configuration (DEMO_MODE, APP_ENV, RELEASE) is read at request time, never baked in at build time.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { default: "AGESOA — Agentic Social Audit", template: "%s · AGESOA" },
  description:
    "AGESOA explains why public-service problems happen and why they keep recurring, with every decision recorded in a public hash-chained log.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  const config = loadConfig();
  return (
    <html lang="en">
      <body className={config.demoMode ? "has-sim-band" : undefined}>
        <a className="skip-link" href="#main">
          Skip to main content
        </a>
        {config.demoMode ? <SimulationBand /> : null}
        <header className="site-header">
          <div className="site-header__inner">
            <Link href="/" className="brand">
              AGESOA
            </Link>
            <nav className="nav" aria-label="Main">
              <ul>
                <li>
                  <NavLink href="/">Home</NavLink>
                </li>
                <li>
                  <NavLink href="/dashboard">Dashboard</NavLink>
                </li>
                <li>
                  <NavLink href="/log">Decision log</NavLink>
                </li>
                <li>
                  <NavLink href="/validate">Validation</NavLink>
                </li>
                <li>
                  <NavLink href="/organizations">Organizations</NavLink>
                </li>
                <li>
                  <NavLink href="/status">Service status</NavLink>
                </li>
                <li>
                  <NavLink href="/ops">Operations</NavLink>
                </li>
              </ul>
            </nav>
          </div>
        </header>
        <main id="main" className="site-main" tabIndex={-1}>
          {children}
        </main>
        <footer className="site-footer">
          <div className="site-footer__inner">
            AGESOA portal · release <span className="mono">{config.release}</span> · environment{" "}
            <span className="mono">{config.appEnv}</span>
          </div>
        </footer>
      </body>
    </html>
  );
}
