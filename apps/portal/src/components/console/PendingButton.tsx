"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";

/**
 * Submit button of a server-action form: while the action runs it is disabled (no double submit), says what is
 * happening and marks itself busy.
 */
export function PendingButton({
  children,
  pendingLabel,
  className = "button",
  testId,
  name,
  value,
}: {
  children: ReactNode;
  pendingLabel: string;
  className?: string;
  testId?: string;
  name?: string;
  value?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className={className}
      disabled={pending}
      aria-busy={pending || undefined}
      data-testid={testId}
      name={name}
      value={value}
    >
      {pending ? pendingLabel : children}
    </button>
  );
}
