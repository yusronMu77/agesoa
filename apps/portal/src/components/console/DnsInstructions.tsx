"use client";

import { useId, useRef } from "react";
import { useT } from "@/lib/i18n/client";
import { CopyButton } from "./CopyButton";

/**
 * "Lihat instruksi DNS" (TXT-REG-065) → PRV-dns "Instruksi untuk admin DNS": domain, type, host and value to hand to
 * the organization's DNS admin. Nothing is sent anywhere; the admin copies the value.
 */
export function DnsInstructions({ domain, value }: { domain: string; value: string }) {
  const t = useT();
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const close = () => {
    dialog.current?.close();
    opener.current?.focus();
  };
  return (
    <>
      <button
        ref={opener}
        type="button"
        className="button button--ghost"
        aria-haspopup="dialog"
        data-testid="dns-instructions"
        onClick={() => dialog.current?.showModal?.()}
      >
        {t("dns.instructions")}
      </button>
      <dialog ref={dialog} className="confirm-dialog" aria-labelledby={titleId} onCancel={close}>
        <h2 id={titleId} className="confirm-dialog__title">
          {t("dns.instructionsTitle")}
        </h2>
        <div className="confirm-dialog__body">
          <p>{t("dns.instructionsDomain", { domain })}</p>
          <p>{t("dns.typeLine")}</p>
          <p>{t("dns.hostLine")}</p>
          <p className="one-time__value">
            <code>{t("dns.instructionsValue", { value })}</code>
          </p>
          <p>{t("dns.instructionsBody")}</p>
        </div>
        <div className="confirm-dialog__actions">
          <CopyButton value={value} label={t("dns.instructionsCopy")} testId="dns-instructions-copy" />
          <button type="button" className="button" onClick={close}>
            {t("dns.instructionsBack")}
          </button>
        </div>
      </dialog>
    </>
  );
}
