import { AiMarker } from "@agesoa/ui/components/ai-marker";
import { SimulationBand as SharedSimulationBand } from "@agesoa/ui/components/simulation-band";
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
    <AiMarker as="p" block data-testid="ai-result-label">
      {children}
    </AiMarker>
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
    <SharedSimulationBand role="note" data-testid="simulation-band">
      {T["TXT-WIT-002"]}
    </SharedSimulationBand>
  );
}
