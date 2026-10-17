import type { Metadata } from "next";
import { loadConfig } from "@/configs/env.config";
import { safeNextPath } from "@/configs/routes.config";
import { LoginView } from "@/features/auth/views/login.view";
import type { PageProps } from "@/lib/page-props";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps) {
  const next = safeNextPath((await searchParams).next);
  return <LoginView auth={loadConfig().auth} next={next} />;
}
