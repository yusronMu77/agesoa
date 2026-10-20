import { Check } from "lucide-react";
import type { StepState } from "@/lib/console-view";

export interface GuideStep {
  label: string;
  state: StepState;
  /** Replaces the default state text ("Done" / "Current step" / "Next"). */
  hint?: string;
}

/**
 * Registration guide (agesoa-uiux "Panduan registrasi"): ink column with the promise, the steps and a privacy note.
 * On narrow screens only the title and a "Step n of m" line remain. All texts arrive translated.
 */
export function StepGuide({
  title,
  intro,
  steps,
  stateText,
  progress,
  foot,
  ariaLabel,
  tone = "ink",
}: {
  title: string;
  intro: string;
  steps: GuideStep[];
  stateText: Record<StepState, string>;
  progress: string;
  foot?: { title: string; body: string };
  ariaLabel: string;
  tone?: "ink" | "light";
}) {
  return (
    <aside className={`step-guide${tone === "light" ? " step-guide--light" : ""}`} aria-label={ariaLabel}>
      <p className="step-guide__title">{title}</p>
      <p className="step-guide__intro">{intro}</p>
      <p className="step-progress">{progress}</p>
      <ol className="steps">
        {steps.map((step, index) => (
          <li
            key={step.label}
            className={`step step--${step.state}`}
            aria-current={step.state === "current" ? "step" : undefined}
          >
            <span className="step__num" aria-hidden="true">
              {step.state === "done" ? <Check size={20} strokeWidth={2.5} /> : index + 1}
            </span>
            <span className="step__label">
              {step.label}
              <span className="step__state">{step.hint ?? stateText[step.state]}</span>
            </span>
          </li>
        ))}
      </ol>
      {foot ? (
        <p className="step-guide__foot">
          <strong>{foot.title}</strong>
          {foot.body}
        </p>
      ) : null}
    </aside>
  );
}

/** "Step 2 of 4: Supporting document" for the first current step (or the last step when all are done). */
export function progressText(steps: GuideStep[], template: (n: number, total: number) => string): string {
  const index = Math.max(
    0,
    steps.findIndex((s) => s.state === "current"),
  );
  return `${template(index + 1, steps.length)}: ${steps[index]?.label ?? ""}`;
}
