import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import type { DnsResult, Organization } from "@/services/trust/trust.model";
import { checkDomain } from "../actions";
import { DNS_RESULT_TEXT } from "../constants";

/** SCR-064: the TXT record to publish and the button that checks it. */
export function DomainVerification({ organization: o }: { organization: Organization }) {
  return (
    <section aria-labelledby="txt-heading" className="card ws-narrow">
      <h2 id="txt-heading">Prove that you control {o.domain}</h2>
      <ol className="ws-steps">
        <li>
          In the DNS settings of <code>{o.domain}</code>, add a <strong>TXT</strong> record on the domain itself (host{" "}
          <code>@</code>) with this value:
          <pre className="txt-record" data-testid="txt-record">
            {o.txt_record}
          </pre>
        </li>
        <li>Wait a few minutes for DNS to update, then check:</li>
      </ol>
      <form action={checkDomain}>
        <input type="hidden" name="organization_id" value={o.organization_id} />
        <Button data-testid="dns-check" className="ws-cta">
          Check DNS
        </Button>
      </form>
    </section>
  );
}

/** SCR-065: result of the last check (from `?check=`). */
export function DnsCheckResult({ result }: { result: DnsResult }) {
  const ok = result === "verified" || result === "already_verified";
  return (
    <Callout tone={ok ? "info" : "error"} role="status" data-testid="dns-result">
      {DNS_RESULT_TEXT[result]}
    </Callout>
  );
}
