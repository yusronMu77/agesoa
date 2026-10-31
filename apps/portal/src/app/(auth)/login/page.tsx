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
 * Public header sign-in. Every console has its own sign-in page (`/validators/login`, `/organizations/login`,
 * `/ops/login`): old `/login?next=…` links get a permanent redirect there, and `/login` without `next` goes to the
 * validator sign-in.
 */
export default async function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const route = resolveLogin(params);
  if ("redirect" in route) permanentRedirect(route.redirect);
  return <SignInPage variant={route.surface} next={route.next} />;
}
