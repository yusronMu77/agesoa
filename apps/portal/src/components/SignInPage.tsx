import Link from "next/link";
import { LoginForm } from "@/components/LoginForm";
import { AuthShell } from "@/components/shell/AuthShell";
import { loadConfig } from "@/lib/config";
import type { MessageKey } from "@/lib/i18n/messages";
import { getT } from "@/lib/i18n/server";
import { ROUTES } from "@/lib/routes";

/**
 * Sign-in variants. Each surface has its own page and only its own copy (DESIGN-BRIEF §1): `validator` and
 * `register` on `/validator/masuk` (SCR-023, TXT-VAL-001..005), `org` on `/instansi/masuk` (SCR-063,
 * TXT-ORG-001..003), `ops` and `public` on `/login`.
 */
export type SignInVariant = "validator" | "register" | "org" | "ops" | "public";

const SURFACE_TITLE: Record<SignInVariant, MessageKey> = {
  public: "public.dashboard.title",
  validator: "signin.validator.title",
  register: "signin.validator.title",
  org: "signin.org.title",
  ops: "console.ops.title",
};

/** Panel and card texts per surface: SCR-023 (validator) and SCR-063 (organisation) follow the design's microcopy. */
function texts(variant: SignInVariant, t: (key: MessageKey) => string) {
  if (variant === "validator" || variant === "org") {
    const k = variant;
    return {
      intro: t(`signin.${k}.intro`),
      points: [1, 2, 3].map((n) => t(`signin.${k}.point${n}` as MessageKey)),
      heading: t(`signin.${k}.heading`),
      sub: t(`signin.${k}.sub`),
      back: t(`signin.${k}.back`),
    };
  }
  const panel = variant === "register" ? "validator" : variant;
  return {
    intro: t(`login.${panel}.intro` as MessageKey),
    points: [1, 2, 3].map((n) => t(`login.${panel}.point${n}` as MessageKey)),
    heading: t(`login.${variant}.heading` as MessageKey),
    sub: t(`login.${variant}.sub` as MessageKey),
    back: t("login.link.backPublic"),
  };
}

/** One sign-in card inside the surface's AuthShell; `next` is already checked (signInTarget / resolveLogin). */
export async function SignInPage({ variant, next, signup = false }: { variant: SignInVariant; next: string; signup?: boolean }) {
  const config = loadConfig();
  const { t } = await getT();
  const copy = texts(variant, t);
  // Organisations register after creating an account (SCR-060); validators have their own registration (SCR-021).
  const orgSignup = variant === "org" && signup;
  // An operator account can be created here; the operator role itself is granted by the environment admin.
  const opsSignup = variant === "ops" && signup;

  return (
    <AuthShell surfaceTitle={t(SURFACE_TITLE[variant])} intro={copy.intro} points={copy.points} band={variant === "ops" ? "data" : "org"}>
      <section className="card login-card" aria-labelledby="login-heading">
        <h1 id="login-heading">{copy.heading}</h1>
        <p className="login-card__sub">{copy.sub}</p>
        <LoginForm
          auth={config.auth}
          next={next}
          allowSignup={variant === "register" || orgSignup || opsSignup}
          initialSignup={orgSignup || opsSignup}
          emailLabel={variant === "org" ? t("signin.org.email") : undefined}
        />
        {opsSignup ? (
          <p className="login-card__note" data-testid="ops-signup-note">
            {t("common.roleSwitch.opsNote")}
          </p>
        ) : null}
        <ul className="login-links">
          {variant === "validator" ? (
            <li>
              <Link href={ROUTES.validatorRegister}>{t("signin.validator.register")}</Link>
            </li>
          ) : null}
          {variant === "org" && !orgSignup ? (
            <li>
              <Link href={`${ROUTES.institutionSignIn}?signup=1`}>{t("signin.org.register")}</Link>
            </li>
          ) : null}
          <li>
            <Link href={ROUTES.home} className="login-links__back">
              {copy.back}
            </Link>
          </li>
        </ul>
      </section>
    </AuthShell>
  );
}
