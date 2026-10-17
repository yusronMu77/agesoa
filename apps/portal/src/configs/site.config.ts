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

export const MAIN_NAV: readonly NavItem[] = [
  { href: ROUTES.home, label: "Home" },
  { href: ROUTES.dashboard, label: "Dashboard" },
  { href: ROUTES.log, label: "Decision log" },
  { href: ROUTES.validate, label: "Validation" },
  { href: ROUTES.organizations, label: "Organizations" },
  { href: ROUTES.status, label: "Service status" },
  { href: ROUTES.ops, label: "Operations" },
];
