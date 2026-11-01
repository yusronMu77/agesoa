import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SignInPage } from "@/components/SignInPage";
import { getT } from "@/lib/i18n/server";
import { signInTarget } from "@/lib/redirect";
import { sessionRoles } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("login.ops.heading") };
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** SCR-090 operator sign-in; `?signup=1` (role switcher "Daftar") starts in "create account" mode. */
export default async function OpsSignInPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const next = signInTarget(typeof params.next === "string" ? params.next : null, "ops");
  // Already signed in with this role and not sent back by a console that refused the session (that redirect always
  // carries `next`, so this can never loop): straight to the console.
  if (params.next === undefined && (await sessionRoles()).includes("ops")) redirect(next);
  return <SignInPage variant="ops" next={next} signup={params.signup === "1"} />;
}
