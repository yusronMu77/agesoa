"use client";

import { type ReactNode, useId, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

/**
 * Submit button that asks first (agesoa-uiux confirmation dialogs: SCR-020 "Kirim putusan Setuju?", PRV-reset-demo,
 * PRV-staff-confirm, PRV-key-confirm). The button checks the form, then opens a modal <dialog>; its confirm button
 * submits the same form (with `name`/`value` when given). Without JavaScript the button submits directly.
 * `{choice}` in the title is replaced by the `data-choice` of the checked input named `choiceName`; `variants` give a
 * whole dialog per checked value instead (SCR-020: "Butuh bukti" asks with PRV-decision-other-confirm).
 */
export function ConfirmSubmit({
  children,
  title,
  body,
  confirmLabel,
  cancelLabel,
  pendingLabel,
  className = "button",
  confirmClassName = "button",
  testId,
  confirmTestId,
  name,
  value,
  choiceName,
  confirmField,
  variants,
}: {
  children: ReactNode;
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel: string;
  pendingLabel: string;
  className?: string;
  confirmClassName?: string;
  testId?: string;
  confirmTestId?: string;
  name?: string;
  value?: string;
  choiceName?: string;
  /** Sent only by the dialog's confirm button, so the server can tell a confirmed submit from a direct one. */
  confirmField?: { name: string; value: string };
  /** Dialog texts per value of the checked `choiceName` input; other values use title/body/labels. */
  variants?: Record<string, { title: string; body: string; confirmLabel: string; cancelLabel: string }>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const [texts, setTexts] = useState({ title, body, confirmLabel, cancelLabel });
  const { pending } = useFormStatus();
  const titleId = useId();
  const bodyId = useId();

  const open = (event: React.MouseEvent<HTMLButtonElement>) => {
    const form = event.currentTarget.form;
    if (!form || !dialog.current?.showModal) return; // no dialog support: submit as is
    event.preventDefault();
    if (!form.reportValidity()) return;
    let choice = "";
    let variant: NonNullable<typeof variants>[string] | undefined;
    if (choiceName) {
      const checked = form.querySelector<HTMLInputElement>(`input[name="${choiceName}"]:checked`);
      choice = checked?.dataset.choice ?? "";
      variant = checked ? variants?.[checked.value] : undefined;
    }
    setTexts(variant ?? { title: title.replace("{choice}", choice), body, confirmLabel, cancelLabel });
    dialog.current.showModal();
  };

  const close = () => {
    dialog.current?.close();
    opener.current?.focus();
  };

  return (
    <>
      <button
        ref={opener}
        type="submit"
        className={className}
        disabled={pending}
        aria-busy={pending || undefined}
        data-testid={testId}
        name={name}
        value={value}
        aria-haspopup="dialog"
        onClick={open}
      >
        {pending ? pendingLabel : children}
      </button>
      <dialog ref={dialog} className="confirm-dialog" aria-labelledby={titleId} aria-describedby={bodyId} onCancel={close}>
        <h2 id={titleId} className="confirm-dialog__title">
          {texts.title}
        </h2>
        <p id={bodyId} className="confirm-dialog__body">
          {texts.body}
        </p>
        <div className="confirm-dialog__actions">
          <button type="button" className="button button--secondary" onClick={close}>
            {texts.cancelLabel}
          </button>
          <button
            type="submit"
            className={confirmClassName}
            name={confirmField?.name ?? name}
            value={confirmField?.value ?? value}
            data-testid={confirmTestId}
            disabled={pending}
            aria-busy={pending || undefined}
            onClick={() => dialog.current?.close()}
          >
            {pending ? pendingLabel : texts.confirmLabel}
          </button>
        </div>
      </dialog>
    </>
  );
}
