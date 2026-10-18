import { EvidenceBadge } from "@agesoa/ui/components/evidence-badge";
/** What each evidence status means; the badges look exactly like the ones on findings. */
export function EvidenceLegend() {
  return (
    <section aria-labelledby="evidence-heading" className="card">
      <h2 id="evidence-heading">How findings are labelled</h2>
      <p className="muted">AI never delivers a verdict. Each finding carries an evidence status:</p>
      <dl className="evidence-legend">
        <div>
          <dt>
            <EvidenceBadge status="alleged">Alleged</EvidenceBadge>
          </dt>
          <dd>Based on reported symptoms only.</dd>
        </div>
        <div>
          <dt>
            <EvidenceBadge status="supported">Supported by evidence</EvidenceBadge>
          </dt>
          <dd>Backed by photos, testimony, patterns across cases or news reports.</dd>
        </div>
        <div>
          <dt>
            <EvidenceBadge status="proven">Proven</EvidenceBadge>
          </dt>
          <dd>Confirmed by laboratory results and a quorum of human validators.</dd>
        </div>
      </dl>
    </section>
  );
}
