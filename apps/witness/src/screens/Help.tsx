/** Bantuan tab: how reporting works, what anonymity means here, how to read evidence status; link to SCR-009. */

import { EvidenceBadge } from "../components";
import { T } from "../copy";
import { Icon } from "../icons";

export function Help({ onLanguage }: { onLanguage: () => void }) {
  return (
    <main className="screen" data-screen="help">
      <h1>{T["TXT-WIT-208"]}</h1>

      <section className="card" aria-labelledby="help-how">
        <h2 id="help-how">{T["TXT-WIT-240"]}</h2>
        <ol className="steps-list">
          <li>{T["TXT-WIT-241"]}</li>
          <li>{T["TXT-WIT-242"]}</li>
          <li>{T["TXT-WIT-243"]}</li>
        </ol>
      </section>

      <section className="card" aria-labelledby="help-anon">
        <h2 id="help-anon">{T["TXT-WIT-244"]}</h2>
        <p>{T["TXT-WIT-245"]}</p>
      </section>

      <section className="card" aria-labelledby="help-evidence">
        <h2 id="help-evidence">{T["TXT-WIT-116"]}</h2>
        <div className="row">
          <EvidenceBadge level="alleged" />
          <EvidenceBadge level="supported" />
          <EvidenceBadge level="proven" />
        </div>
        <p>{T["TXT-WIT-246"]}</p>
      </section>

      <section aria-labelledby="help-settings">
        <h2 id="help-settings">{T["TXT-WIT-247"]}</h2>
        <button type="button" className="button start" onClick={onLanguage}>
          <Icon name="globe" />
          <span className="grow">{T["TXT-WIT-250"]}</span>
          <Icon name="chevronRight" />
        </button>
      </section>
    </main>
  );
}
