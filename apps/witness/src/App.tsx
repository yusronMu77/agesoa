/**
 * AGESOA Witness: anonymous citizen reporting.
 * SCR-001 record evidence -> (SCR-002 permission explainer) -> (SCR-003 social link / screenshot)
 * -> SCR-004 review the Agen Intake draft -> SCR-005 submitted.
 */

import { useEffect, useMemo, useState } from "react";
import type { PackDocument, Report } from "./api";
import { ApiError, IngestionClient } from "./api";
import { Notice, SimulationBand } from "./components";
import type { WitnessConfig } from "./config";
import { T } from "./copy";
import type { Capability } from "./device";
import { permissionStatus } from "./device";
import { Capture } from "./screens/Capture";
import { DraftReview } from "./screens/DraftReview";
import { PermissionExplainer } from "./screens/PermissionExplainer";
import { SharedPost } from "./screens/SharedPost";
import { Submitted } from "./screens/Submitted";
import type { CaptureState } from "./state";
import { EMPTY_CAPTURE, hasContent } from "./state";

type Screen =
  | { name: "capture" }
  | { name: "social" }
  | { name: "draft"; report: Report; intakeFailed: boolean }
  | { name: "submitted"; report: Report };

interface PendingPermission {
  kind: Capability;
  action: () => void;
  onSkip: () => void;
}

export function messageFor(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === null) return T["TXT-WIT-130"];
    if (error.status === 413) return T["TXT-WIT-132"];
    if (error.status === 415) return T["TXT-WIT-131"];
    if (error.status === 422 && error.detail.startsWith("shared_post.url")) return T["TXT-WIT-065"];
    return error.detail;
  }
  return error instanceof Error ? error.message : String(error);
}

export default function App({ config }: { config: WitnessConfig }) {
  const client = useMemo(() => new IngestionClient(config), [config]);
  const [screen, setScreen] = useState<Screen>({ name: "capture" });
  const [capture, setCapture] = useState<CaptureState>(EMPTY_CAPTURE);
  const [pack, setPack] = useState<PackDocument | null>(null);
  const [explained, setExplained] = useState<Capability[]>([]);
  const [pending, setPending] = useState<PendingPermission | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    client.pack(config.domain).then(setPack, (err) => setError(messageFor(err)));
  }, [client, config.domain]);

  const update = (change: Partial<CaptureState>) => setCapture((current) => ({ ...current, ...change }));

  const withPermission = (kind: Capability, action: () => void, onSkip: () => void) => {
    void permissionStatus(kind).then((status) => {
      if (status === "granted" || explained.includes(kind)) action();
      else setPending({ kind, action, onSkip });
    });
  };

  const toDraft = async () => {
    setError(null);
    if (!hasContent(capture)) {
      setError(T["TXT-WIT-031"]);
      return;
    }
    setBusy(true);
    try {
      let reportId = capture.reportId;
      if (!reportId) {
        const created = await client.createReport({
          domain: config.domain,
          narrative: capture.narrative.trim() || null,
          district_code: capture.district?.district_code ?? null,
          shared_post: capture.sharedPost,
        });
        reportId = created.id;
        update({ reportId });
      } else {
        await client.patchReport(reportId, {
          narrative: capture.narrative.trim() || null,
          shared_post: capture.sharedPost,
          ...(capture.district?.district_code ? { district_code: capture.district.district_code } : {}),
        });
      }
      const items = [...capture.items];
      for (const [index, item] of items.entries()) {
        if (item.evidenceId) continue;
        const stored = await client.uploadEvidence(reportId, item.kind, item.blob, item.name);
        items[index] = { ...item, evidenceId: stored.evidence_id };
        update({ items: [...items] });
      }
      let report: Report;
      let intakeFailed = false;
      try {
        report = await client.runIntake(reportId);
      } catch (err) {
        if (!(err instanceof ApiError && err.status === 503)) throw err;
        intakeFailed = true; // the reporter fills the draft by hand
        report = await client.getReport(reportId);
      }
      setScreen({ name: "draft", report, intakeFailed });
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setBusy(false);
    }
  };

  const restart = () => {
    capture.items.forEach((item) => URL.revokeObjectURL(item.previewUrl));
    setCapture(EMPTY_CAPTURE);
    setError(null);
    setScreen({ name: "capture" });
  };

  return (
    <div className="app">
      {config.demoMode && <SimulationBand />}
      <header className="app-header">
        <span className="app-name">{T["TXT-WIT-001"]}</span>
      </header>

      {screen.name === "capture" && (
        <Capture
          client={client}
          state={capture}
          update={update}
          withPermission={withPermission}
          onSocial={() => setScreen({ name: "social" })}
          onContinue={() => void toDraft()}
          busy={busy || !pack}
          error={error}
        />
      )}
      {screen.name === "social" && (
        <SharedPost
          initial={capture.sharedPost}
          screenshots={capture.items.filter((i) => i.kind === "screenshot")}
          onSave={(sharedPost, screenshots) => {
            update({ sharedPost, items: [...capture.items.filter((i) => i.kind !== "screenshot"), ...screenshots] });
            setScreen({ name: "capture" });
          }}
          onBack={() => setScreen({ name: "capture" })}
        />
      )}
      {screen.name === "draft" && pack && (
        <DraftReview
          client={client}
          pack={pack}
          initial={screen.report}
          intakeFailed={screen.intakeFailed}
          onSubmitted={(report) => setScreen({ name: "submitted", report })}
        />
      )}
      {screen.name === "submitted" && <Submitted report={screen.report} onNew={restart} />}
      {!pack && error && screen.name !== "capture" && <Notice tone="error">{error}</Notice>}

      {pending && (
        <PermissionExplainer
          kind={pending.kind}
          onAllow={() => {
            setExplained((list) => [...list, pending.kind]);
            setPending(null);
            pending.action();
          }}
          onSkip={() => {
            setExplained((list) => [...list, pending.kind]);
            setPending(null);
            pending.onSkip();
          }}
        />
      )}
    </div>
  );
}
