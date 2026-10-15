import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SimOrgBand } from "@/components/SimOrgBand";
import { loadConfig } from "@/lib/config";
import { sessionToken } from "@/lib/session";
import { getMyProfile, listNewsrooms, listRoles, REJECTION_TEXT, registerValidator } from "@/lib/trust";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Become a validator" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const NEXT = "/validators/register";

async function submit(formData: FormData) {
  "use server";
  const token = await sessionToken();
  if (!token) redirect(`/login?next=${NEXT}`);
  const file = formData.get("document");
  if (!(file instanceof File) || file.size === 0) redirect(`${NEXT}?error=${encodeURIComponent("Choose a document image.")}`);
  const form = new FormData();
  for (const key of ["role", "field", "regency_name"]) form.set(key, String(formData.get(key) ?? ""));
  const org = String(formData.get("organization_id") ?? "");
  if (org) form.set("organization_id", org);
  form.set("document", file, file.name || "document");
  const result = await registerValidator(loadConfig(), token, form);
  if (!result.ok) {
    const detail = (result.body as { detail?: unknown } | null)?.detail;
    const message =
      result.status === 415
        ? "The document must be a JPEG, PNG or WebP image."
        : result.status === 409
          ? "You are already registered."
          : typeof detail === "string"
            ? detail
            : `The registration could not be processed (${result.error}).`;
    redirect(`${NEXT}?error=${encodeURIComponent(message)}`);
  }
  redirect(`${NEXT}?done=1`);
}

export default async function RegisterPage({ searchParams }: { searchParams: SearchParams }) {
  const token = await sessionToken();
  if (!token) redirect(`/login?next=${NEXT}`);
  const config = loadConfig();
  const [profile, roles, newsrooms] = await Promise.all([
    getMyProfile(config, token),
    listRoles(config),
    listNewsrooms(config),
  ]);
  const { error } = await searchParams;
  const me = profile.ok ? profile.data : null;

  return (
    <>
      {config.demoMode ? <SimOrgBand /> : null}
      <h1>Become a validator</h1>
      <p className="muted">
        Validators review audit findings before they become final. Upload one document that proves your role (press
        card, assignment letter or professional certificate). Agen Peran reads it; the image is not stored. Your name
        is never shown publicly: findings show only your role and regency.
      </p>

      {me ? (
        <section className="card" data-testid="registration-status" aria-labelledby="status-heading">
          <h2 id="status-heading">Your registration</h2>
          {me.status === "awaiting_confirmation" ? (
            <p>
              <strong>Waiting for your newsroom.</strong> Your document was read; the newsroom you named will confirm you as
              staff. You can validate findings once it has.
            </p>
          ) : me.status === "rejected" ? (
            <p>
              <strong>Not accepted:</strong> {REJECTION_TEXT[me.rejection_reason ?? ""] ?? me.rejection_reason}. You can try
              again with another document.
            </p>
          ) : (
            <p>
              <strong>Accepted</strong> as {me.role_label}, {me.tier} tier
              {me.probation ? " — new validator (probation)" : ""}. Sign out and in again, then open{" "}
              <Link href="/validate">Validation</Link>.
            </p>
          )}
          {me.confidence !== null ? (
            <p className="muted">Document read with confidence {Math.round(me.confidence * 100)}%.</p>
          ) : null}
        </section>
      ) : null}

      {typeof error === "string" ? (
        <p className="callout callout--error" role="alert" data-testid="register-error">
          {error}
        </p>
      ) : null}

      {!me || me.status === "rejected" ? (
        <form action={submit} className="card form" data-testid="validator-register-form">
          <label>
            Role
            <select name="role" required defaultValue="">
              <option value="" disabled>
                Choose…
              </option>
              {roles.ok ? roles.data.map((r) => <option key={r.id} value={r.id}>{r.label}</option>) : null}
            </select>
          </label>
          <label>
            Field of work
            <input name="field" required minLength={2} maxLength={120} placeholder="e.g. Health desk" />
          </label>
          <label>
            Regency
            <input name="regency_name" required minLength={2} maxLength={120} />
          </label>
          <label>
            Newsroom (optional; it confirms you as staff → tier high)
            <select name="organization_id" defaultValue="">
              <option value="">None (independent → tier medium)</option>
              {newsrooms.ok
                ? newsrooms.data.map((n) => (
                    <option key={n.organization_id} value={n.organization_id}>
                      {n.name}
                    </option>
                  ))
                : null}
            </select>
          </label>
          <label>
            Role document (image)
            <input name="document" type="file" accept="image/jpeg,image/png,image/webp" required />
          </label>
          <button type="submit" className="button">
            Register
          </button>
        </form>
      ) : null}
    </>
  );
}
