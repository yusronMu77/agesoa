/** SCR-003 Paste a social post link and/or upload screenshots as extra evidence. */

import { useState } from "react";
import type { SharedPostInput } from "../api";
import { Notice } from "../components";
import { Icon } from "../icons";
import { T } from "../copy";
import { isPostLink } from "../fields";
import type { EvidenceItem } from "../state";
import { newItem } from "../state";

export function SharedPost({
  initial,
  screenshots: initialShots,
  onSave,
  onBack,
}: {
  initial: SharedPostInput | null;
  screenshots: EvidenceItem[];
  onSave: (post: SharedPostInput | null, screenshots: EvidenceItem[]) => void;
  onBack: () => void;
}) {
  const [url, setUrl] = useState(initial?.url ?? "");
  const [excerpt, setExcerpt] = useState(initial?.excerpt ?? "");
  const [shots, setShots] = useState(initialShots);
  const [invalid, setInvalid] = useState(false);

  const save = () => {
    const link = url.trim();
    if (link && !isPostLink(link)) {
      setInvalid(true);
      return;
    }
    onSave(link ? { url: link, excerpt: excerpt.trim() || null } : null, shots);
  };

  return (
    <main className="screen" data-screen="SCR-003">
      <h1>{T["TXT-WIT-060"]}</h1>
      <div className="field">
        <label className="field-label" htmlFor="post-link">
          {T["TXT-WIT-061"]}
        </label>
        <input
          id="post-link"
          type="url"
          inputMode="url"
          autoComplete="off"
          placeholder="https://"
          value={url}
          aria-invalid={invalid}
          aria-describedby={invalid ? "post-link-error" : "post-link-hint"}
          onChange={(event) => {
            setUrl(event.target.value);
            setInvalid(false);
          }}
        />
        {invalid ? (
          <p className="field-error" id="post-link-error" role="alert">
            <Icon name="alert" size={16} />
            {T["TXT-WIT-065"]}
          </p>
        ) : (
          <p className="field-hint" id="post-link-hint">
            {T["TXT-WIT-062"]}
          </p>
        )}
      </div>
      <div className="field">
        <label className="field-label" htmlFor="post-excerpt">
          {T["TXT-WIT-063"]}
        </label>
        <textarea
          id="post-excerpt"
          rows={4}
          maxLength={1000}
          placeholder={T["TXT-WIT-218"]}
          aria-describedby="post-excerpt-hint"
          value={excerpt}
          onChange={(event) => setExcerpt(event.target.value)}
        />
        <p className="field-hint" id="post-excerpt-hint">
          {T["TXT-WIT-064"]}
        </p>
      </div>

      <section>
        {shots.length > 0 && (
          <ul className="items" aria-label={T["TXT-WIT-066"]}>
            {shots.map((item, index) => (
              <li key={item.key} className="item">
                <img className="item-thumb" src={item.previewUrl} alt={`Screenshot ${index + 1}`} />
                <span className="item-body">
                  <span className="item-name">{item.name}</span>
                </span>
                <button
                  type="button"
                  className="button ghost small"
                  aria-label={`${T["TXT-WIT-016"]} screenshot ${index + 1}`}
                  onClick={() => setShots((list) => list.filter((s) => s.key !== item.key))}
                >
                  {T["TXT-WIT-016"]}
                </button>
              </li>
            ))}
          </ul>
        )}
        <label className="button">
          <Icon name="upload" />
          {T["TXT-WIT-066"]}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            className="visually-hidden"
            onChange={(event) => {
              const files = [...(event.target.files ?? [])];
              setShots((list) => [...list, ...files.map((f) => newItem("screenshot", f, f.name))]);
              event.target.value = "";
            }}
          />
        </label>
      </section>
      <Notice tone="info" title={T["TXT-WIT-216"]}>
        {T["TXT-WIT-217"]}
      </Notice>

      <div className="actions">
        <button type="button" className="button primary lg wide" onClick={save}>
          {T["TXT-WIT-067"]}
        </button>
        <button type="button" className="button ghost wide" onClick={onBack}>
          {T["TXT-WIT-068"]}
        </button>
      </div>
    </main>
  );
}
