import "@agesoa/ui/tokens.css";
import "./globals.css";

import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { loadConfig } from "@/configs/env.config";
import { SITE } from "@/configs/site.config";

// Configuration (DEMO_MODE, APP_ENV, RELEASE) is read at request time, never baked in at build time.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: SITE.title, description: SITE.description };

export default function RootLayout({ children }: { children: ReactNode }) {
  const config = loadConfig();
  return (
    <html lang="en">
      <body className={config.demoMode ? "has-sim-band" : undefined}>
        <AppShell config={config}>{children}</AppShell>
      </body>
    </html>
  );
}
