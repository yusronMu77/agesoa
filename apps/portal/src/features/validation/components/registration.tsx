import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ROUTES } from "@/configs/routes.config";
import type { NewsroomOption, RoleOption, ValidatorProfile } from "@/services/trust/trust.model";
import { registerValidator } from "../actions";
import { DOCUMENT_TYPES, REJECTION_TEXT } from "../constants";

/** SCR-026: where the registration stands. Activation follows a human decision, never the AI reading. */
export function RegistrationStatus({ me }: { me: ValidatorProfile }) {
  return (
    <section
      className={`card ws-tone ws-tone--${me.status === "awaiting_confirmation" ? "warn" : me.status === "rejected" ? "error" : "ok"}`}
      data-testid="registration-status"
      aria-labelledby="status-heading"
    >
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
          <Link href={ROUTES.validate}>Validation</Link>.
        </p>
      )}
      {me.confidence !== null ? <p className="muted">Document read with confidence {Math.round(me.confidence * 100)}%.</p> : null}
    </section>
  );
}

/** SCR-021/024: role, field, regency, optional newsroom and the role document in one form. */
export function RegisterForm({ roles, newsrooms }: { roles: RoleOption[]; newsrooms: NewsroomOption[] }) {
  return (
    <form action={registerValidator} className="card ws-form" data-testid="validator-register-form">
      <label>
        Role
        <select name="role" required defaultValue="">
          <option value="" disabled>
            Choose…
          </option>
          {roles.map((r) => (
            <option key={r.id} value={r.id}>
              {r.label}
            </option>
          ))}
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
          {newsrooms.map((n) => (
            <option key={n.organization_id} value={n.organization_id}>
              {n.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Role document (image)
        <input name="document" type="file" accept={DOCUMENT_TYPES} required />
      </label>
      <Button>Register</Button>
    </form>
  );
}
