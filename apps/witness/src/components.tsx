import { Alert, AlertDescription, AlertTitle } from "@agesoa/ui/components/alert";
import { AiCallout } from "@agesoa/ui/components/ai-marker";
import { SimulationBand as SharedSimulationBand } from "@agesoa/ui/components/simulation-band";
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon } from "lucide-react";
import type { ReactNode } from "react";
import type { District } from "./api";
import { T } from "./copy";

/**
 * A callout (Penpot `Callout`): icon, optional title in the tone colour, then the text. Errors are announced
 * (`role="alert"`), the rest is a status.
 */
export function Notice({
  tone,
  title,
  children,
  testId,
}: {
  tone: "info" | "warning" | "success" | "error";
  title?: ReactNode;
  children?: ReactNode;
  testId?: string;
}) {
  const Icon = tone === "info" ? InfoIcon : tone === "success" ? CircleCheckIcon : TriangleAlertIcon;
  return (
    <Alert
      variant={tone === "error" ? "destructive" : tone}
      role={tone === "error" ? "alert" : "status"}
      data-testid={testId}
    >
      <Icon aria-hidden="true" />
      {title && <AlertTitle>{title}</AlertTitle>}
      {children && <AlertDescription className="text-base text-foreground">{children}</AlertDescription>}
    </Alert>
  );
}

/** A sentence "Title. Rest." as the callout title and text; one sentence is the text alone. */
export function splitSentence(text: string): { title?: string; rest: string } {
  const at = text.indexOf(". ");
  return at === -1 ? { rest: text } : { title: text.slice(0, at), rest: text.slice(at + 2) };
}

/** Marks agent output. Text label and a neutral icon (no sparkles); the reporter can always correct it. */
export function AiResultLabel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <AiCallout title={title} data-testid="ai-result-label">
      {children}
    </AiCallout>
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
