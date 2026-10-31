import type { Metadata } from "next";
import { SignInPage } from "@/components/SignInPage";
import { getT } from "@/lib/i18n/server";
import { signInTarget } from "@/lib/redirect";

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
  return <SignInPage variant="ops" next={next} signup={params.signup === "1"} />;
}
