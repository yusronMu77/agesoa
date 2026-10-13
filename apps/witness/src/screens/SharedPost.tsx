/** SCR-003 Paste a social post link and/or upload screenshots as extra evidence. */

import { useState } from "react";
import type { SharedPostInput } from "../api";
import { Notice } from "../components";
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
      <label className="field">
        <span className="field-label">{T["TXT-WIT-061"]}</span>
        <span className="field-hint" id="post-link-hint">
          {T["TXT-WIT-062"]}
        </span>
        <input
          type="url"
          inputMode="url"
          autoComplete="off"
          value={url}
          aria-invalid={invalid}
          aria-describedby={invalid ? "post-link-error" : "post-link-hint"}
          onChange={(event) => {
            setUrl(event.target.value);
            setInvalid(false);
          }}
        />
      </label>
      {invalid && (
        <p className="field-error" id="post-link-error" role="alert">
          {T["TXT-WIT-065"]}
        </p>
      )}
      <label className="field">
        <span className="field-label">{T["TXT-WIT-063"]}</span>
        <textarea rows={3} maxLength={1000} value={excerpt} onChange={(event) => setExcerpt(event.target.value)} />
      </label>
      <Notice tone="info">{T["TXT-WIT-064"]}</Notice>

      <label className="button">
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
      {shots.length > 0 && (
        <ul className="thumbs" aria-label={T["TXT-WIT-066"]}>
          {shots.map((item, index) => (
            <li key={item.key}>
              <img src={item.previewUrl} alt={`Screenshot ${index + 1}`} />
              <button
                type="button"
                className="button small"
                aria-label={`${T["TXT-WIT-016"]} screenshot ${index + 1}`}
                onClick={() => setShots((list) => list.filter((s) => s.key !== item.key))}
              >
                {T["TXT-WIT-016"]}
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="actions">
        <button type="button" className="button primary wide" onClick={save}>
          {T["TXT-WIT-067"]}
        </button>
        <button type="button" className="button wide" onClick={onBack}>
          {T["TXT-WIT-068"]}
        </button>
      </div>
    </main>
  );
}
