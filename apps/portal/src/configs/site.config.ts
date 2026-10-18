/** Site identity and the main navigation (client-safe: no environment variables). */

import { ROUTES } from "./routes.config";

export const SITE = {
  name: "AGESOA",
  title: { default: "AGESOA — Agentic Social Audit", template: "%s · AGESOA" },
  description:
    "AGESOA explains why public-service problems happen and why they keep recurring, with every decision recorded in a public hash-chained log.",
} as const;

export interface NavItem {
  href: string;
  label: string;
}

/** Public sections of the header (Penpot SCR-040 header: Findings, Decision log, About). */
export const MAIN_NAV: readonly NavItem[] = [
  { href: ROUTES.dashboard, label: "Findings" },
  { href: ROUTES.log, label: "Decision log" },
  { href: ROUTES.home, label: "About" },
];

/** Pages for validators, organizations and operators, behind the role menu on the right of the header. */
export const ACCOUNT_NAV: readonly NavItem[] = [
  { href: ROUTES.validate, label: "Validation" },
  { href: ROUTES.organizations, label: "Organizations" },
  { href: ROUTES.status, label: "Service status" },
  { href: ROUTES.ops, label: "Operations" },
];
