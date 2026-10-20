"use client";

import { Copy } from "lucide-react";
import { useState } from "react";
import { useT } from "@/lib/i18n/client";

/** Copies a value (the DNS TXT record) to the clipboard and says so in a live region. */
export function CopyButton({ value }: { value: string }) {
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
      <button type="button" className="button button--secondary" onClick={copy} data-testid="copy-txt">
        <Copy aria-hidden size={18} strokeWidth={2} />
        {t("dns.copy")}
      </button>
      <span className="copy-row__feedback" role="status">
        {state === "copied" ? t("dns.copied") : state === "failed" ? t("dns.copyFailed") : ""}
      </span>
    </span>
  );
}
