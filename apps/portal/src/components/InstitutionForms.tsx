"use client";

import { useActionState } from "react";
import { rotateApiKey, saveWebhook, testEvent } from "@/app/organizations/[organizationId]/actions";
import type { Subscription } from "@/lib/institutions";

/**
 * Agency dashboard forms (SCR-062). One-time values (webhook secret, API key) come back as action state and are
 * kept only in this component: they are never in the URL and a reload does not show them again.
 */

function OneTimeValue({ testId, label, value }: { testId: string; label: string; value: string }) {
  return (
    <div className="callout one-time" role="status">
      <p>
        <strong>{label}</strong> — shown only once. Copy it now into the institution system; AGESOA cannot show it
        again.
      </p>
      <pre className="txt-record" data-testid={testId}>
        {value}
      </pre>
    </div>
  );
}

function ErrorText({ error }: { error: string }) {
  return (
    <p className="callout callout--error" role="alert">
      {error}
    </p>
  );
}

export function WebhookForm({ organizationId, subscription }: { organizationId: string; subscription: Subscription | null }) {
  const [state, action, pending] = useActionState(saveWebhook, null);
  return (
    <form action={action} className="form" data-testid="webhook-form">
      <input type="hidden" name="organization_id" value={organizationId} />
      <label>
        Webhook URL
        <input type="url" name="webhook_url" required defaultValue={subscription?.webhook_url ?? ""} placeholder="https://" />
      </label>
      <label>
        Region code (optional)
        <input type="text" name="region_code" maxLength={32} defaultValue={subscription?.region_code ?? ""} />
      </label>
      <label>
        Category (optional)
        <input type="text" name="category" maxLength={48} defaultValue={subscription?.category ?? ""} />
      </label>
      <p className="muted">Leave region and category empty to receive every final audit report.</p>
      <div>
        <button type="submit" className="button" disabled={pending}>
          Save webhook
        </button>
      </div>
      {state?.ok === false ? <ErrorText error={state.error} /> : null}
      {state?.ok ? <OneTimeValue testId="webhook-secret" label="Webhook signing secret" value={state.secret} /> : null}
    </form>
  );
}

export function TestEventForm({ organizationId }: { organizationId: string }) {
  const [state, action, pending] = useActionState(testEvent, null);
  return (
    <form action={action} className="form">
      <input type="hidden" name="organization_id" value={organizationId} />
      <div>
        <button type="submit" className="button button--secondary" disabled={pending} data-testid="send-test-event">
          Send test event
        </button>
      </div>
      {state?.ok === false ? <ErrorText error={state.error} /> : null}
      {state?.ok ? (
        <p className="callout" role="status" data-testid="test-event-result">
          Test event queued: delivery <code>{state.delivery_id}</code>. Refresh the history to see the attempts.
        </p>
      ) : null}
    </form>
  );
}

export function ApiKeyForm({ organizationId, hasKey }: { organizationId: string; hasKey: boolean }) {
  const [state, action, pending] = useActionState(rotateApiKey, null);
  return (
    <form action={action} className="form">
      <input type="hidden" name="organization_id" value={organizationId} />
      {hasKey ? <p className="muted">Creating a new key revokes the current one.</p> : null}
      <div>
        <button type="submit" className="button" disabled={pending} data-testid="create-api-key">
          Create API key
        </button>
      </div>
      {state?.ok === false ? <ErrorText error={state.error} /> : null}
      {state?.ok ? <OneTimeValue testId="api-key-once" label="API key" value={state.api_key} /> : null}
    </form>
  );
}
