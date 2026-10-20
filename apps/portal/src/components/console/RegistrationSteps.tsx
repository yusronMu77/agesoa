"use client";

import { createContext, type ReactNode, useContext, useState } from "react";

const StepContext = createContext<{ step: number; setStep: (step: number) => void }>({ step: 0, setStep: () => {} });

/** Current registration step shared by the guide (left) and the form (right), so the guide follows the wizard. */
export function RegistrationStepProvider({ initial, children }: { initial: number; children: ReactNode }) {
  const [step, setStep] = useState(initial);
  return <StepContext.Provider value={{ step, setStep }}>{children}</StepContext.Provider>;
}

export function useRegistrationStep() {
  return useContext(StepContext);
}

/** The numbered steps of the guide: done / current step / next, in the reader's language (texts arrive translated). */
export function RegistrationSteps({ labels, states }: { labels: string[]; states: { done: string; current: string; next: string } }) {
  const { step } = useRegistrationStep();
  return (
    <ol className="register-steps">
      {labels.map((label, index) => {
        const state = index < step ? "done" : index === step ? "current" : "next";
        return (
          <li key={label} className={`register-step register-step--${state}`} aria-current={state === "current" ? "step" : undefined}>
            <span className="register-step__num" aria-hidden="true">
              {index + 1}
            </span>
            <span className="register-step__text">
              <span className="register-step__label">{label}</span>
              <span className="register-step__state">{states[state]}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** "Validator · Langkah 2 dari 4" on phones; `template` has {n}. */
export function RegistrationMobileStep({ template }: { template: string }) {
  const { step } = useRegistrationStep();
  return <p className="register-mobile__step">{template.replace("{n}", String(step + 1))}</p>;
}
