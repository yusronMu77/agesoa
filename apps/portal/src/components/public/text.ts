/** Small text helpers of the public surface on top of the portal translator. */

import type { Translate, Vars } from "@/lib/i18n/core";
import type { MessageKey } from "@/lib/i18n/messages";
import { publicId } from "@/lib/i18n/public";
import type { ActorCategory } from "@/lib/publicview";
import type { PublicFinding } from "@/lib/readmodel";

type Countable = "cases" | "findings" | "reports" | "evidence" | "evidenceRefs" | "entries";

const has = (key: string): key is MessageKey => key in publicId;

/** "{n} case" / "{n} cases" (Indonesian has one form; both keys exist). */
export function count(t: Translate, what: Countable, n: number, vars: Vars = {}): string {
  return t(n === 1 ? `public.count.${what}.one` : `public.count.${what}.other`, { n, ...vars });
}

/** Readable title of a log action code; unknown codes are returned as they are. */
export function actionLabel(t: Translate, action: string): string {
  const key = `public.action.${action}`;
  return has(key) ? t(key) : action;
}

export function actorLabel(t: Translate, category: ActorCategory): string {
  return t(`public.actor.${category}`);
}

/** Message for a dynamic key when it exists, else the fallback (e.g. a case status the portal does not know). */
export function optional(t: Translate, key: string, fallback: string, vars?: Vars): string {
  return has(key) ? t(key, vars) : fallback;
}

/** Validation state of a finding, the text of the `validation-status` badge. */
export function validationText(t: Translate, validation: PublicFinding["validation"]): string {
  if (!validation) return t("public.validation.waiting");
  return validation.outcome === "approved"
    ? t("public.validation.approved", { n: validation.decisions.length })
    : t("public.validation.returned");
}
