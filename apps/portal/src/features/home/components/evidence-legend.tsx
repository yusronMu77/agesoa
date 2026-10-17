/** What each evidence status means; the badges look exactly like the ones on findings. */
export function EvidenceLegend() {
  return (
    <section aria-labelledby="evidence-heading" className="card">
      <h2 id="evidence-heading">How findings are labelled</h2>
      <p className="muted">AI never delivers a verdict. Each finding carries an evidence status:</p>
      <dl className="evidence-legend">
        <div>
          <dt>
            <span className="badge badge--evidence badge--alleged">Alleged</span>
          </dt>
          <dd>Based on reported symptoms only.</dd>
        </div>
        <div>
          <dt>
            <span className="badge badge--evidence badge--supported">Supported by evidence</span>
          </dt>
          <dd>Backed by photos, testimony, patterns across cases or news reports.</dd>
        </div>
        <div>
          <dt>
            <span className="badge badge--evidence badge--proven">Proven</span>
          </dt>
          <dd>Confirmed by laboratory results and a quorum of human validators.</dd>
        </div>
      </dl>
    </section>
  );
}
