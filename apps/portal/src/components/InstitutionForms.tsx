"use client";

import { KeyRound } from "lucide-react";
import { useActionState } from "react";
import { rotateApiKey, saveWebhook, testEvent } from "@/app/(institution)/organizations/[organizationId]/actions";
import { useT } from "@/lib/i18n/client";
import type { Subscription } from "@/lib/institutions";

/**
 * Agency dashboard forms (SCR-062). One-time values (webhook secret, API key) come back as action state and are
 * kept only in this component: they are never in the URL and a reload does not show them again.
 */

function OneTimeValue({ testId, label, value }: { testId: string; label: string; value: string }) {
  const t = useT();
  return (
    <div className="callout callout--warning callout--inline one-time" role="status">
      <p className="callout__title">
        <KeyRound aria-hidden size={18} strokeWidth={2} />
        {label}
      </p>
      <p>{t("int.oneTime")}</p>
      <pre className="txt-record" data-testid={testId}>
        {value}
      </pre>
    </div>
  );
}

function ErrorText({ error }: { error: string }) {
  return (
    <p className="callout callout--error callout--inline" role="alert">
      {error}
    </p>
  );
}

export function WebhookForm({ organizationId, subscription }: { organizationId: string; subscription: Subscription | null }) {
  const t = useT();
  const [state, action, pending] = useActionState(saveWebhook, null);
  return (
    <form action={action} className="form" data-testid="webhook-form" aria-busy={pending || undefined}>
      <input type="hidden" name="organization_id" value={organizationId} />
      <label>
        {t("int.webhookUrl")}
        <input type="url" name="webhook_url" required defaultValue={subscription?.webhook_url ?? ""} placeholder="https://" />
      </label>
      <label>
        {t("int.regionCode")}
        <input type="text" name="region_code" maxLength={32} defaultValue={subscription?.region_code ?? ""} />
      </label>
      <label>
        {t("int.categoryField")}
        <input type="text" name="category" maxLength={48} defaultValue={subscription?.category ?? ""} />
      </label>
      <p className="field-hint">{t("int.filtersHint")}</p>
      <div>
        <button type="submit" className="button" disabled={pending}>
          {t("int.saveWebhook")}
        </button>
      </div>
      {state?.ok === false ? <ErrorText error={state.error} /> : null}
      {state?.ok ? <OneTimeValue testId="webhook-secret" label={t("int.secretLabel")} value={state.secret} /> : null}
    </form>
  );
}

export function TestEventForm({ organizationId }: { organizationId: string }) {
  const t = useT();
  const [state, action, pending] = useActionState(testEvent, null);
  return (
    <form action={action} className="form test-event-form" aria-busy={pending || undefined}>
      <input type="hidden" name="organization_id" value={organizationId} />
      <div>
        <button type="submit" className="button button--secondary" disabled={pending} data-testid="send-test-event">
          {t("int.testEvent")}
        </button>
      </div>
      {state?.ok === false ? <ErrorText error={state.error} /> : null}
      {state?.ok ? (
        <p className="callout callout--success callout--inline" role="status" data-testid="test-event-result">
          {t("int.testQueued", { id: state.delivery_id })}
        </p>
      ) : null}
    </form>
  );
}

export function ApiKeyForm({ organizationId, hasKey }: { organizationId: string; hasKey: boolean }) {
  const t = useT();
  const [state, action, pending] = useActionState(rotateApiKey, null);
  return (
    <form action={action} className="form api-key-form" aria-busy={pending || undefined}>
      <input type="hidden" name="organization_id" value={organizationId} />
      {hasKey ? <p className="field-hint field-hint--top">{t("int.apiKeyRotate")}</p> : null}
      <div>
        <button type="submit" className="button" disabled={pending} data-testid="create-api-key">
          {t("int.apiKeyCreate")}
        </button>
      </div>
      {state?.ok === false ? <ErrorText error={state.error} /> : null}
      {state?.ok ? <OneTimeValue testId="api-key-once" label={t("int.apiKeyLabel")} value={state.api_key} /> : null}
    </form>
  );
}
