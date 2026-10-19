import { CameraIcon, MapPinIcon, MicIcon } from "lucide-react";
import { button } from "../ui";
/** SCR-002 Permission explainer, shown before the browser/phone permission prompt. */

import { useEffect, useRef } from "react";
import { Notice } from "../components";
import { T } from "../copy";
import type { Capability } from "../device";

const TEXT = {
  camera: { icon: CameraIcon, title: T["TXT-WIT-040"], body: T["TXT-WIT-041"], fallback: T["TXT-WIT-217"] },
  microphone: { icon: MicIcon, title: T["TXT-WIT-042"], body: T["TXT-WIT-043"], fallback: T["TXT-WIT-218"] },
  geolocation: { icon: MapPinIcon, title: T["TXT-WIT-044"], body: T["TXT-WIT-045"], fallback: T["TXT-WIT-219"] },
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
  const { icon: Icon, title, body, fallback } = TEXT[kind];
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
      <div className="sheet-body">
        <span className="sheet-icon" aria-hidden="true">
          <Icon />
        </span>
        <h2 id="permission-title">{title}</h2>
        <p className="lead">{body}</p>
        <Notice tone="info" title={T["TXT-WIT-216"]}>
          {fallback}
        </Notice>
      </div>
      <div className="actions">
        <button type="button" className={button("primary", { wide: true })} onClick={onAllow} autoFocus>
          {T["TXT-WIT-046"]}
        </button>
        <button type="button" className={button("ghost", { wide: true })} onClick={onSkip}>
          {T["TXT-WIT-047"]}
        </button>
      </div>
    </dialog>
  );
}
