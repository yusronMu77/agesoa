import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SignInPage } from "@/components/SignInPage";
import { getT } from "@/lib/i18n/server";
import { signInTarget } from "@/lib/redirect";
import { ROUTES } from "@/lib/routes";
import { sessionRoles } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("signin.validator.heading") };
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** SCR-023 validator sign-in; from the registration wizard (`next=/validator/daftar`) it can also create an account. */
export default async function ValidatorSignInPage({ searchParams }: { searchParams: SearchParams }) {
  const raw = (await searchParams).next;
  const next = signInTarget(typeof raw === "string" ? raw : null, "validator");
  // Already signed in with this role and not sent back by a console that refused the session (that redirect always
  // carries `next`, so this can never loop): straight to the console.
  if (raw === undefined && (await sessionRoles()).includes("validator")) redirect(next);
  const register = next === ROUTES.validatorRegister || next.startsWith(`${ROUTES.validatorRegister}?`);
  return <SignInPage variant={register ? "register" : "validator"} next={next} />;
}
