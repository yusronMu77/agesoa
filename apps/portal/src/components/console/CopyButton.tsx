"use client";

import { Copy } from "lucide-react";
import { useState } from "react";
import { useT } from "@/lib/i18n/client";

/** Copies a value (the DNS TXT record) to the clipboard and says so in a live region. */
export function CopyButton({
  value,
  label,
  copiedLabel,
  testId = "copy-txt",
}: {
  value: string;
  label?: string;
  copiedLabel?: string;
  testId?: string;
}) {
  const t = useT();
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setState("copied");
    } catch {
      setState("failed");
    }
  }
  return (
    <span className="copy-row">
      <button type="button" className="button button--secondary" onClick={copy} data-testid={testId}>
        <Copy aria-hidden size={18} strokeWidth={2} />
        {label ?? t("dns.copy")}
      </button>
      <span className="copy-row__feedback" role="status">
        {state === "copied" ? (copiedLabel ?? t("dns.copied")) : state === "failed" ? t("dns.copyFailed") : ""}
      </span>
    </span>
  );
}
