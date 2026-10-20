import type { Metadata } from "next";
import { permanentRedirect } from "next/navigation";
import { SignInPage } from "@/components/SignInPage";
import { getT } from "@/lib/i18n/server";
import { resolveLogin } from "@/lib/redirect";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("login.meta") };
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * Shared sign-in for the operator (`/login?next=/ops`) and the public header link. Validators and institutions have
 * their own sign-in pages (`/validator/masuk`, `/instansi/masuk`): old `/login?next=…` links get a permanent redirect
 * there, and `/login` without `next` goes to the validator sign-in.
 */
export default async function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const route = resolveLogin(params);
  if ("redirect" in route) permanentRedirect(route.redirect);
  // `?signup=1` (role switcher "Daftar" for the operator) starts in "create account" mode.
  return <SignInPage variant={route.surface} next={route.next} signup={params.signup === "1"} />;
}
