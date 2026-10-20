import type { ReactNode } from "react";
import { validatorStatusText } from "@/components/ValidatorHeader";
import { type ConsoleIdentity, type ConsoleNavItem, ConsoleShell } from "@/components/shell/ConsoleShell";
import { loadConfig } from "@/lib/config";
import { getT } from "@/lib/i18n/server";
import type { Organization } from "@/lib/organizations";
import { ROUTES } from "@/lib/routes";
import type { ValidatorProfile } from "@/lib/trust";

export type ValidatorSection = "queue" | "decisions" | "role" | "log" | null;

/**
 * Validator console (SCR-020/022): queue, my decisions, decision log, role and region. The identity card shows the
 * role, tier and region, never a name; e2e reads it as `validator-profile`.
 */
export async function ValidatorConsole({
  profile,
  section,
  context,
  children,
}: {
  profile: ValidatorProfile | null;
  section: ValidatorSection;
  context?: ReactNode;
  children: ReactNode;
}) {
  const { t } = await getT();
  const nav: ConsoleNavItem[] = [
    { href: ROUTES.validator, label: t("console.validator.nav.queue"), icon: "queue", current: section === "queue" },
    { href: ROUTES.validatorDecided, label: t("console.validator.nav.decisions"), icon: "decisions", current: section === "decisions" },
    { href: ROUTES.validatorLog, label: t("console.validator.nav.log"), icon: "log", current: section === "log" },
    { href: ROUTES.validatorRegister, label: t("console.validator.nav.register"), icon: "role", current: section === "role" },
  ];
  let identity: ConsoleIdentity | undefined;
  if (profile) {
    const tier = profile.tier ? t("validator.profile.tier", { tier: t(`validator.tier.${profile.tier}`) }) : null;
    const sub = [tier, profile.region?.regency_name].filter(Boolean).join(" · ");
    identity = {
      testId: "validator-profile",
      title: profile.role_label,
      sub: sub || undefined,
      extra: (
        <>
          {profile.probation ? (
            <span className="badge badge--neutral console-identity__badge" data-testid="probation-badge">
              {t("validator.profile.probation")}
            </span>
          ) : null}
          <span className="sr-only">
            {` · ${profile.organization ?? t("validator.profile.independent")} · `}
            {t("validator.profile.status", { status: validatorStatusText(t, profile.status) })}
          </span>
          {profile.synthetic ? (
            <span className="sr-only" data-testid="validator-sim-band">
              {" · "}
              <span lang="id">SIMULASI</span> — {t("validator.profile.sim")}
            </span>
          ) : null}
        </>
      ),
    };
  }
  return (
    <ConsoleShell surface="validator" nav={nav} role={t("common.role.validator")} context={context} identity={identity} home={ROUTES.validator}>
      {children}
    </ConsoleShell>
  );
}

export type InstitutionSection = "register" | "profile" | "staff" | "integration" | "inbox" | "log" | null;

/**
 * Institution console (SCR-060–062). Before verification: registration, organization profile; a verified newsroom
 * confirms its staff, a verified agency runs its integration and reads what was delivered to it.
 */
export async function InstitutionConsole({
  organization,
  section,
  context,
  children,
}: {
  organization: Organization | null;
  section: InstitutionSection;
  context?: ReactNode;
  children: ReactNode;
}) {
  const { t } = await getT();
  const o = organization;
  const orgHref = o ? ROUTES.organization(o.organization_id) : null;
  const nav: ConsoleNavItem[] = [];
  if (o && orgHref && o.status === "verified" && o.kind === "agency") {
    nav.push(
      { href: ROUTES.organizationHistory(o.organization_id), label: t("console.institution.nav.inbox"), icon: "inbox", current: section === "inbox" },
      { href: orgHref, label: t("console.institution.nav.integration"), icon: "integration", current: section === "integration" },
    );
  } else if (o && orgHref && o.status === "verified") {
    nav.push({ href: orgHref, label: t("console.institution.nav.staff"), icon: "staff", current: section === "staff" });
  } else if (o && orgHref) {
    nav.push({ href: orgHref, label: t("console.institution.nav.profile"), icon: "profile", current: section === "profile" });
  }
  nav.unshift({
    href: ROUTES.institution,
    label: t("console.institution.nav.organizations"),
    icon: "register",
    current: section === "register",
  });
  nav.push({ href: ROUTES.institutionLog, label: t("console.institution.nav.log"), icon: "log", current: section === "log" });
  const role = o ? t(`orgKind.short.${o.kind}`) : t("common.role.institution");
  const identity: ConsoleIdentity | undefined = o
    ? {
        testId: "organization-identity",
        title: o.synthetic && !/\((fictional|fiktif|simulasi|simulation)\)/i.test(o.name) ? t("console.institution.identitySim", { name: o.name }) : o.name,
        sub: o.status === "verified" ? t("console.institution.verified") : t("console.institution.unverified"),
      }
    : undefined;
  return (
    <ConsoleShell surface="institution" nav={nav} role={role} context={context} identity={identity} home={orgHref ?? ROUTES.institution}>
      {children}
    </ConsoleShell>
  );
}

export type OpsSection = "machine" | "status" | null;

/** Operator console (SCR-090): machine status with its events, outbox and demo-mode sections, service status. */
export async function OpsConsole({ section, context, children }: { section: OpsSection; context?: ReactNode; children: ReactNode }) {
  const { t } = await getT();
  const config = loadConfig();
  const nav: ConsoleNavItem[] = [
    { href: "/ops", label: t("console.ops.nav.ops"), icon: "machine", current: section === "machine" },
    { href: "/ops#events", label: t("console.ops.nav.events"), icon: "events" },
    { href: "/ops#outbox", label: t("console.ops.nav.outbox"), icon: "outbox" },
    { href: "/ops#demo", label: t("console.ops.nav.demo"), icon: "demo" },
  ];
  return (
    <ConsoleShell
      surface="ops"
      nav={nav}
      role={t("common.role.operator")}
      context={context}
      identity={{ title: t("common.role.operator"), sub: t("console.ops.environment", { env: config.appEnv }) }}
      home="/ops"
    >
      {children}
    </ConsoleShell>
  );
}
