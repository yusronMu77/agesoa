/** SCR-007 Post received: a post shared from another app, shown before it goes on to the draft (SCR-004). */

import type { SharedPostInput } from "../api";
import { Notice } from "../components";
import { T } from "../copy";
import { Icon } from "../icons";

export function SharedReceived({
  post,
  busy,
  error,
  onExcerpt,
  onContinue,
  onBack,
}: {
  post: SharedPostInput;
  busy: boolean;
  error: string | null;
  onExcerpt: (excerpt: string) => void;
  onContinue: () => void;
  onBack: () => void;
}) {
  return (
    <main className="screen" data-screen="SCR-007">
      <h1>{T["TXT-WIT-150"]}</h1>
      <Notice tone="info">{T["TXT-WIT-151"]}</Notice>
      <div className="field">
        <span className="field-label">{T["TXT-WIT-061"]}</span>
        <p className="shared-link" data-testid="shared-link">
          {post.url}
        </p>
      </div>
      <div className="field">
        <label className="field-label" htmlFor="received-excerpt">
          {T["TXT-WIT-152"]}
        </label>
        <textarea
          id="received-excerpt"
          rows={4}
          maxLength={1000}
          value={post.excerpt ?? ""}
          aria-describedby="received-excerpt-hint"
          onChange={(event) => onExcerpt(event.target.value)}
        />
        <p className="field-hint" id="received-excerpt-hint">
          {T["TXT-WIT-153"]} {T["TXT-WIT-064"]}
        </p>
      </div>
      {error && (
        <p className="field-error" role="alert">
          <Icon name="alert" size={16} />
          {error}
        </p>
      )}
      <div className="actions">
        <button type="button" className="button primary wide" disabled={busy} onClick={onContinue}>
          {T["TXT-WIT-030"]}
        </button>
        <button type="button" className="button wide" disabled={busy} onClick={onBack}>
          {T["TXT-WIT-068"]}
        </button>
      </div>
    </main>
  );
}
