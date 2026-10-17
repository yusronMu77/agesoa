"use server";

import { redirect } from "next/navigation";
import { loadConfig } from "@/configs/env.config";
import { ROUTES, withQuery } from "@/configs/routes.config";
import { requireSession } from "@/features/auth/server/require-session";
import { checkboxField } from "@/lib/form-data";
import { resetDemo } from "@/services/platform/ops.service";

/** Demo reset by an operator; needs the confirmation box. The services refuse it outside demo_mode. */
export async function runDemoReset(formData: FormData) {
  const token = await requireSession(ROUTES.ops);
  if (!checkboxField(formData, "confirm")) redirect(withQuery(ROUTES.ops, { reset: "unconfirmed" }));
  const report = await resetDemo(loadConfig(), token);
  const failed = report.steps.filter((s) => !s.ok).map((s) => `${s.service}: ${s.detail}`);
  redirect(
    withQuery(ROUTES.ops, {
      reset: report.ok ? "ok" : "failed",
      seconds: report.seconds,
      error: failed.length ? failed.join("; ") : undefined,
    }),
  );
}
