import type { Metadata } from "next";
import { ROUTES } from "@/configs/routes.config";
import { requireSession } from "@/features/auth/server/require-session";
import { loadValidationQueue } from "@/features/validation/server/load-validation";
import { ValidationQueueView } from "@/features/validation/views/validation-queue.view";
import { type PageProps, stringParam } from "@/lib/page-props";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Validation" };

export default async function ValidatePage({ searchParams }: PageProps) {
  const token = await requireSession(ROUTES.validate);
  const data = await loadValidationQueue(token);
  return <ValidationQueueView {...data} done={stringParam((await searchParams).done)} />;
}
