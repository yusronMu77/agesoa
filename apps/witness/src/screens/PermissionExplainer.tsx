/** SCR-002 Permission explainer, shown before the browser/phone permission prompt. */

import { useEffect, useRef } from "react";
import { AppHeader, Notice, SimulationBand } from "../components";
import type { TextId } from "../copy";
import { T } from "../copy";
import type { Capability } from "../device";
import type { IconName } from "../icons";
import { Icon } from "../icons";

const TEXT: Record<Capability, { icon: IconName; title: TextId; body: TextId; fallback: TextId }> = {
  camera: { icon: "camera", title: "TXT-WIT-040", body: "TXT-WIT-041", fallback: "TXT-WIT-413" },
  microphone: { icon: "mic", title: "TXT-WIT-042", body: "TXT-WIT-043", fallback: "TXT-WIT-414" },
  geolocation: { icon: "pin", title: "TXT-WIT-044", body: "TXT-WIT-045", fallback: "TXT-WIT-415" },
};

export function PermissionExplainer({
  kind,
  demoMode,
  onAllow,
  onSkip,
}: {
  kind: Capability;
  /** The modal covers the app, so it repeats the simulation band (which can never be hidden). */
  demoMode: boolean;
  onAllow: () => void;
  onSkip: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
    return () => element?.close();
  }, []);
  const text = TEXT[kind];
  return (
    <dialog
      ref={dialog}
      className="fullscreen"
      aria-labelledby="permission-title"
      aria-describedby="permission-body"
      data-screen="SCR-002"
      onCancel={(event) => {
        event.preventDefault();
        onSkip();
      }}
    >
      {demoMode && <SimulationBand testId={null} />}
      <AppHeader />
      <div className="permission">
        <span className="hero-icon hero-icon--primary">
          <Icon name={text.icon} size={40} />
        </span>
        {/* Focus starts on the question, not on a button, so nothing is pre-selected for the reporter. */}
        <h2 id="permission-title" tabIndex={-1} autoFocus>
          {T[text.title]}
        </h2>
        <p id="permission-body" className="lead">
          {T[text.body]}
        </p>
        <Notice tone="info" title={T["TXT-WIT-412"]}>
          {T[text.fallback]}
        </Notice>
      </div>
      <div className="actions">
        <button type="button" className="button primary wide" onClick={onAllow}>
          {T["TXT-WIT-046"]}
        </button>
        <button type="button" className="button ghost wide" onClick={onSkip}>
          {T["TXT-WIT-047"]}
        </button>
      </div>
    </dialog>
  );
}
