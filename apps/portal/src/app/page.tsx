import Link from "next/link";

export default function HomePage() {
  return (
    <>
      <h1>Find out why problems keep happening</h1>
      <p className="lead">
        Complaint channels record what happened. AGESOA, an agentic social audit platform, works out why it
        happened and why it keeps happening, so the same failure is not reported again next month.
      </p>
      <p>
        AI agents gather reports and signals and draft audit findings. People decide: every finding stays
        provisional until a quorum of human validators confirms it, and every decision is written to a public,
        hash-chained log that anyone can verify.
      </p>

      <ul className="card-grid" aria-label="Explore">
        <li className="card">
          <h2>
            <Link href="/log">Decision log</Link>
          </h2>
          <p>Every recorded decision in order, with its hash and the hash of the entry before it.</p>
        </li>
        <li className="card">
          <h2>
            <Link href="/status">Service status</Link>
          </h2>
          <p>Live readiness of the five backend services behind this portal.</p>
        </li>
      </ul>

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
    </>
  );
}
