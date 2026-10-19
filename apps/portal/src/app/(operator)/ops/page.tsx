import type { Metadata } from "next";
import { ROUTES } from "@/configs/routes.config";
import { requireSession } from "@/features/auth/server/require-session";
import { loadOps } from "@/features/ops/server/load-ops";
import { OpsView } from "@/features/ops/views/ops.view";
import { type PageProps, stringParam } from "@/lib/page-props";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Operations" };

export default async function OpsPage({ searchParams }: PageProps) {
  const token = await requireSession(ROUTES.ops);
  const data = await loadOps(token);
  const { reset, seconds, error } = await searchParams;
  return <OpsView {...data} reset={{ reset: stringParam(reset), seconds: stringParam(seconds), error: stringParam(error) }} />;
}
