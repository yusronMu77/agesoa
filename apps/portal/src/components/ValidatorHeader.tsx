import { ShieldCheck } from "lucide-react";
import type { MessageKey } from "@/lib/i18n/messages";
import { getT } from "@/lib/i18n/server";
import type { ValidatorProfile } from "@/lib/trust";

const STATUSES = ["active", "probation", "awaiting_confirmation", "rejected"];

/** Status word of a validator profile in the reader's language ("probation", "awaiting confirmation", …). */
export function validatorStatusText(t: (key: MessageKey) => string, status: string): string {
  return STATUSES.includes(status) ? t(`validator.status.${status}` as MessageKey) : status.replace(/_/g, " ");
}

/**
 * Who is deciding (role label + tier, never a name) and a SIMULASI line for seeded demo validators. Signing out is
 * in the console sidebar.
 */
export async function ValidatorHeader({ profile }: { profile: ValidatorProfile }) {
  const { t } = await getT();
  const status = validatorStatusText(t, profile.status);
  return (
    <div className="card validator-card profile-card" data-testid="validator-profile">
      <span className="profile-card__icon" aria-hidden="true">
        <ShieldCheck size={22} strokeWidth={2} />
      </span>
      <div className="profile-card__body">
        {profile.synthetic ? (
          <p className="sim-inline" data-testid="validator-sim-band">
            <span lang="id">SIMULASI</span> — {t("validator.profile.sim")}
          </p>
        ) : null}
        <p>
          {t("validator.profile.signedInAs")} <strong>{profile.role_label}</strong>
          {profile.tier ? ` · ${t("validator.profile.tier", { tier: t(`validator.tier.${profile.tier}`) })}` : ""}
          {` · ${profile.organization ?? t("validator.profile.independent")}`}
          {profile.region?.regency_name ? ` · ${profile.region.regency_name}` : ""} ·{" "}
          {t("validator.profile.status", { status })}
          {profile.probation ? (
            <>
              {" "}
              <span className="badge badge--neutral" data-testid="probation-badge">
                {t("validator.profile.probation")}
              </span>
            </>
          ) : null}
        </p>
      </div>
    </div>
  );
}
