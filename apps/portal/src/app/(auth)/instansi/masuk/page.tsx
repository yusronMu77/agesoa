import type { Metadata } from "next";
import { SignInPage } from "@/components/SignInPage";
import { getT } from "@/lib/i18n/server";
import { signInTarget } from "@/lib/redirect";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("signin.org.heading") };
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** SCR-063 organisation sign-in; `?signup=1` starts in "create account" mode (registration, SCR-060). */
export default async function InstitutionSignInPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const next = signInTarget(typeof params.next === "string" ? params.next : null, "institution");
  return <SignInPage variant="org" next={next} signup={params.signup === "1"} />;
}
