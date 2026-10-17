/** Results of the agency dashboard actions (useActionState); one-time values live only here, never in a URL. */

export type ActionError = { ok: false; error: string };
export type WebhookState = null | ActionError | { ok: true; secret: string; webhook_url: string };
export type ApiKeyState = null | ActionError | { ok: true; api_key: string; prefix: string };
export type TestEventState = null | ActionError | { ok: true; delivery_id: string };
