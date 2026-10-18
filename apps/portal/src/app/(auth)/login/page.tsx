import "../../(validator)/console.css";

import type { Metadata } from "next";
import Link from "next/link";
import { LoginForm } from "@/components/LoginForm";
import { AuthShell } from "@/components/shell/AuthShell";
import { loadConfig } from "@/lib/config";
import type { MessageKey } from "@/lib/i18n/messages";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("login.meta") };
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
type Surface = "validator" | "register" | "org" | "ops" | "public";

const SURFACE_TITLE: Record<Surface, MessageKey> = {
  public: "public.dashboard.title",
  validator: "console.validator.title",
  register: "console.validator.title",
  org: "console.institution.title",
  ops: "console.ops.title",
};

/** SCR-023 (validator), SCR-063 (organization) and the operator sign-in: one page, texts chosen by `next`. */
export default async function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  const config = loadConfig();
  const { t } = await getT();
  const raw = (await searchParams).next;
  const next = typeof raw === "string" && raw.startsWith("/") && !raw.startsWith("//") ? raw : "/validate";
  const surface: Surface = next === "/dashboard" || next === "/" ? "public" : next.startsWith("/organizations")
    ? "org"
    : next.startsWith("/ops")
      ? "ops"
      : next.startsWith("/validators/register")
        ? "register"
        : "validator";
  const panel = surface === "register" ? "validator" : surface;
  const heading = t(`login.${surface}.heading` as MessageKey);
  // Only validators can register themselves; organizations are registered after signing in, operators are seeded.
  const showRegister = surface === "validator";

  return (
    <AuthShell
      surfaceTitle={t(SURFACE_TITLE[surface])}
      intro={t(`login.${panel}.intro` as MessageKey)}
      points={[1, 2, 3].map((n) => t(`login.${panel}.point${n}` as MessageKey))}
      band={surface === "ops" ? "data" : "org"}
    >
      <section className="card login-card" aria-labelledby="login-heading">
        <h1 id="login-heading">{surface === "register" ? t("login.register.heading") : heading}</h1>
        <p className="muted">{t(`login.${surface}.sub` as MessageKey)}</p>
        {config.auth.emulatorUrl ? (
          <p className="callout" data-testid="emulator-note">
            {t("login.emulator")}
          </p>
        ) : null}
        <LoginForm auth={config.auth} next={next} allowSignup={surface === "register"} />
        <ul className="login-links">
          {showRegister ? (
            <li>
              <Link href="/validators/register">{t("login.link.register")}</Link>
            </li>
          ) : null}
          <li>
            <Link href="/dashboard" className="muted">
              {t("login.link.backPublic")}
            </Link>
          </li>
        </ul>
      </section>
    </AuthShell>
  );
}
