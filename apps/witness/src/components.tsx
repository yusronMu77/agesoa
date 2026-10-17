import { notice } from "./ui";
import type { ReactNode } from "react";
import type { District } from "./api";
import { T } from "./copy";

export function Notice({ tone, children, testId }: { tone: "info" | "error"; children: ReactNode; testId?: string }) {
  return (
    <p className={notice(tone)} role={tone === "error" ? "alert" : "status"} data-testid={testId}>
      <span aria-hidden="true">{tone === "error" ? "!" : "i"}</span>
      {children}
    </p>
  );
}

/** Marks agent output. Text label and a neutral icon (no sparkles); the reporter can always correct it. */
export function AiResultLabel({ children }: { children: ReactNode }) {
  return (
    <p className="ai-label" data-testid="ai-result-label">
      <svg aria-hidden="true" viewBox="0 0 16 16" width="16" height="16">
        <rect x="2.5" y="2.5" width="11" height="11" rx="2" fill="none" stroke="currentColor" />
        <path d="M5 6h6M5 8.5h6M5 11h3.5" stroke="currentColor" />
      </svg>
      {children}
    </p>
  );
}

export function RegionName({ region, synthetic }: { region: District; synthetic: boolean }) {
  return (
    <span className="region" data-testid="region">
      <strong>{region.district_name}</strong>, {region.regency_name}
      {synthetic && <span className="tag">{T["TXT-WIT-118"]}</span>}
    </span>
  );
}

export function SimulationBand() {
  return (
    <div className="sim-band" role="note" data-testid="simulation-band">
      {T["TXT-WIT-002"]}
    </div>
  );
}
