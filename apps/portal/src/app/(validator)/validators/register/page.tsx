import type { Metadata } from "next";
import { ROUTES } from "@/configs/routes.config";
import { requireSession } from "@/features/auth/server/require-session";
import { loadRegistration } from "@/features/validation/server/load-validation";
import { ValidatorRegisterView } from "@/features/validation/views/validator-register.view";
import { type PageProps, stringParam } from "@/lib/page-props";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Become a validator" };

export default async function RegisterPage({ searchParams }: PageProps) {
  const token = await requireSession(ROUTES.validatorRegister);
  const data = await loadRegistration(token);
  return <ValidatorRegisterView {...data} error={stringParam((await searchParams).error)} />;
}
