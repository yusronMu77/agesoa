"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { loadConfig } from "@/lib/config";
import { getT } from "@/lib/i18n/server";
import {
  type ApiKeyState,
  createApiKey,
  errorDetail,
  optionalField,
  saveSubscription,
  sendTestEvent,
  type TestEventState,
  type WebhookState,
} from "@/lib/institutions";
import { sessionToken } from "@/lib/session";

/** Agency dashboard (SCR-062) actions. The one-time secret / API key is returned as action state only. */

async function context(formData: FormData): Promise<{ id: string; token: string; path: string }> {
  const id = String(formData.get("organization_id") ?? "");
  const path = `/organizations/${encodeURIComponent(id)}`;
  const token = await sessionToken();
  if (!token) redirect(`/login?next=${path}`);
  return { id, token, path };
}

export async function saveWebhook(_previous: WebhookState, formData: FormData): Promise<WebhookState> {
  const { id, token, path } = await context(formData);
  const { t } = await getT();
  const webhookUrl = optionalField(formData.get("webhook_url"));
  if (!webhookUrl) return { ok: false, error: t("int.error.noUrl") };
  const result = await saveSubscription(loadConfig(), token, id, {
    webhook_url: webhookUrl,
    region_code: optionalField(formData.get("region_code")),
    category: optionalField(formData.get("category")),
  });
  if (!result.ok) {
    return {
      ok: false,
      error:
        result.status === 422
          ? t("int.error.invalidUrl", { detail: errorDetail(result) })
          : t("int.error.notSaved", { detail: errorDetail(result) }),
    };
  }
  revalidatePath(path);
  return { ok: true, secret: result.data.secret, webhook_url: result.data.subscription.webhook_url };
}

export async function rotateApiKey(_previous: ApiKeyState, formData: FormData): Promise<ApiKeyState> {
  const { id, token, path } = await context(formData);
  const { t } = await getT();
  const result = await createApiKey(loadConfig(), token, id);
  if (!result.ok) return { ok: false, error: t("int.error.noKey", { detail: errorDetail(result) }) };
  revalidatePath(path);
  return { ok: true, api_key: result.data.api_key, prefix: result.data.prefix };
}

export async function testEvent(_previous: TestEventState, formData: FormData): Promise<TestEventState> {
  const { id, token, path } = await context(formData);
  const { t } = await getT();
  const result = await sendTestEvent(loadConfig(), token, id);
  if (!result.ok) {
    return {
      ok: false,
      error: result.status === 409 ? t("int.error.saveFirst") : t("int.error.notSent", { detail: errorDetail(result) }),
    };
  }
  revalidatePath(path);
  return { ok: true, delivery_id: result.data.delivery_id };
}
