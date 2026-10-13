/** SCR-002 Permission explainer, shown before the browser/phone permission prompt. */

import { useEffect, useRef } from "react";
import { T } from "../copy";
import type { Capability } from "../device";

const TEXT = {
  camera: [T["TXT-WIT-040"], T["TXT-WIT-041"]],
  microphone: [T["TXT-WIT-042"], T["TXT-WIT-043"]],
  geolocation: [T["TXT-WIT-044"], T["TXT-WIT-045"]],
} as const;

export function PermissionExplainer({
  kind,
  onAllow,
  onSkip,
}: {
  kind: Capability;
  onAllow: () => void;
  onSkip: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
    return () => element?.close();
  }, []);
  const [title, body] = TEXT[kind];
  return (
    <dialog
      ref={dialog}
      className="sheet"
      aria-labelledby="permission-title"
      data-screen="SCR-002"
      onCancel={(event) => {
        event.preventDefault();
        onSkip();
      }}
    >
      <h2 id="permission-title">{title}</h2>
      <p>{body}</p>
      <div className="actions">
        <button type="button" className="button primary wide" onClick={onAllow} autoFocus>
          {T["TXT-WIT-046"]}
        </button>
        <button type="button" className="button wide" onClick={onSkip}>
          {T["TXT-WIT-047"]}
        </button>
      </div>
    </dialog>
  );
}
