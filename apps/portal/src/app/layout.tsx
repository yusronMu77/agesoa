import "@agesoa/ui/fonts.css";
import "@agesoa/ui/tokens.css";
import "./globals.css";

import { ClerkProvider } from "@clerk/nextjs";
import { clerkEnabled, clerkPublishableKey } from "@/lib/clerk-config";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { I18nProvider } from "@/lib/i18n/client";
import { getT } from "@/lib/i18n/server";

// Configuration (DEMO_MODE, APP_ENV, RELEASE) and the reader's language are read at request time.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { default: "AGESOA — Agentic Social Audit", template: "%s · AGESOA" },
  description:
    "AGESOA explains why public-service problems happen and why they keep recurring, with every decision recorded in a public hash-chained log.",
};

/** Root: language + skip link only. Each surface (public, validator, institution, operator, sign-in) draws its own shell. */
export default async function RootLayout({ children }: { children: ReactNode }) {
  const { lang, t } = await getT();
  return (
    <html lang={lang}>
      <body>
        <a className="skip-link" href="#main">
          {t("common.skip")}
        </a>
        {clerkEnabled() ? (
          <ClerkProvider publishableKey={clerkPublishableKey()} appearance={{ variables: { colorPrimary: "#6D151A", colorBackground: "#FEFAF0", fontFamily: "IBM Plex Sans, sans-serif", borderRadius: "0.5rem" }, elements: { modalContent: "auth-motion", card: "clerk-card" } }}>
            <I18nProvider lang={lang}>{children}</I18nProvider>
          </ClerkProvider>
        ) : <I18nProvider lang={lang}>{children}</I18nProvider>}
      </body>
    </html>
  );
}
