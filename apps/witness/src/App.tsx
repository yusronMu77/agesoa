import { BottomNav, BottomNavItem } from "@agesoa/ui/components/bottom-nav";
import { Logo } from "@agesoa/ui/components/logo";
import { RoleChip } from "@agesoa/ui/components/role-chip";
import type { StepperStep } from "@agesoa/ui/components/stepper";
import { Stepper } from "@agesoa/ui/components/stepper";
import { CameraIcon, CircleHelpIcon, ListIcon, MessageCircleIcon } from "lucide-react";
/**
 * AGESOA Witness: anonymous citizen reporting.
 * SCR-001 record evidence -> (SCR-002 permission explainer) -> (SCR-003 social link / screenshot)
 * -> SCR-004 review the Agen Intake draft -> SCR-005 submitted.
 * The tab bar leads to SCR-006 answer audit questions, SCR-008 my reports and SCR-009 language and region.
 */

import { useEffect, useMemo, useState } from "react";
import type { PackDocument, Report, WitnessQuestion } from "./api";
import { ApiError, CaseAuditClient, IngestionClient } from "./api";
import { SimulationBand } from "./components";
import type { WitnessConfig } from "./config";
import { T } from "./copy";
import type { Capability } from "./device";
import { permissionStatus } from "./device";
import { Capture } from "./screens/Capture";
import { DraftReview } from "./screens/DraftReview";
import { Language } from "./screens/Language";
import { MyReports } from "./screens/MyReports";
import { PermissionExplainer } from "./screens/PermissionExplainer";
import { lastReportId, rememberReport } from "./reports";
import { Questions } from "./screens/Questions";
import { SharedPost } from "./screens/SharedPost";
import { Submitted } from "./screens/Submitted";
import type { CaptureState } from "./state";
import { EMPTY_CAPTURE, hasContent } from "./state";

type Screen =
  | { name: "capture" }
  | { name: "social" }
  | { name: "draft"; report: Report; intakeFailed: boolean }
  | { name: "submitted"; report: Report }
  | { name: "questions" }
  | { name: "mine" }
  | { name: "language"; from: Screen };

type Tab = "capture" | "mine" | "questions" | "help";

interface PendingPermission {
  kind: Capability;
  action: () => void;
  onSkip: () => void;
}

const QUESTION_POLL_MS = 10_000;

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

/** The step of the report flow a screen belongs to; screens outside the flow have no stepper. */
function stepsFor(screen: Screen): StepperStep[] | null {
  const labels = [T["TXT-WIT-202"], T["TXT-WIT-203"], T["TXT-WIT-204"]];
  const current = screen.name === "capture" ? 0 : screen.name === "draft" ? 1 : screen.name === "submitted" ? 2 : -1;
  if (current === -1) return null;
  return labels.map((label, index) => ({
    label,
    state: index < current ? "done" : index === current ? "current" : "upcoming",
  }));
}

/** The tab a screen belongs to, or null when the tab bar is hidden (a focused task: draft, link, language). */
function tabFor(screen: Screen): Tab | null {
  switch (screen.name) {
    case "capture":
      return "capture";
    case "submitted":
    case "mine":
      return "mine";
    case "questions":
      return "questions";
    default:
      return null;
  }
}

export default function App({ config }: { config: WitnessConfig }) {
  const client = useMemo(() => new IngestionClient(config), [config]);
  const audit = useMemo(() => new CaseAuditClient(config), [config]);
  const [screen, setScreen] = useState<Screen>({ name: "capture" });
  const [capture, setCapture] = useState<CaptureState>(EMPTY_CAPTURE);
  const [pack, setPack] = useState<PackDocument | null>(null);
  const [packLoading, setPackLoading] = useState(true);
  const [packAttempt, setPackAttempt] = useState(0);
  const [explained, setExplained] = useState<Capability[]>([]);
  const [pending, setPending] = useState<PendingPermission | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [questions, setQuestions] = useState<WitnessQuestion[]>([]);
  const [lastReport, setLastReport] = useState<Report | null>(null);

  // Questions appear after the report has been grouped into a case, so look again while the app is open. An
  // unreachable audit service never blocks reporting: the tab just shows no count.
  useEffect(() => {
    let live = true;
    const load = () =>
      audit.questions().then(
        (list) => live && setQuestions(list),
        () => undefined,
      );
    void load();
    const timer = setInterval(() => void load(), QUESTION_POLL_MS);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [audit]);

  const answer = async (question: WitnessQuestion, text: string) => {
    await audit.answer(question.case_id, question.question_id, text);
    setQuestions((list) => list.filter((q) => q.question_id !== question.question_id));
  };

  useEffect(() => {
    let live = true;
    setPackLoading(true);
    setError(null);
    void client
      .pack(config.domain)
      .then((document) => {
        if (live) {
          setPack(document);
        }
      })
      .catch((err) => {
        if (live) setError(err instanceof ApiError && err.status === 404 ? T["TXT-WIT-191"] : messageFor(err));
      })
      .finally(() => {
        if (live) setPackLoading(false);
      });
    return () => {
      live = false;
    };
  }, [client, config.domain, packAttempt]);

  const update = (change: Partial<CaptureState>) => setCapture((current) => ({ ...current, ...change }));

  const withPermission = (kind: Capability, action: () => void, onSkip: () => void) => {
    void permissionStatus(kind).then((status) => {
      if (status === "granted" || explained.includes(kind)) action();
      else setPending({ kind, action, onSkip });
    });
  };

  const toDraft = async () => {
    if (!pack) return;
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
          domain: pack.id,
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

  const openQuestions = () => {
    setScreen({ name: "questions" });
    const id = lastReportId();
    // The status card is a courtesy: an unreachable or unknown report never blocks answering.
    if (id) client.getReport(id).then(setLastReport, () => setLastReport(null));
  };

  const goTab = (tab: Tab) => {
    if (tab === "capture") setScreen({ name: "capture" });
    else if (tab === "mine") setScreen({ name: "mine" });
    else if (tab === "questions") openQuestions();
    else setScreen({ name: "language", from: screen });
  };

  const steps = stepsFor(screen);
  const tab = tabFor(screen);
  const current = (name: Tab) => (tab === name ? "page" : undefined);

  return (
    <div className="app" data-nav={tab ? "" : undefined}>
      {config.demoMode && <SimulationBand />}
      <header className="app-header">
        <Logo size={28}>{T["TXT-WIT-001"]}</Logo>
        <RoleChip role="warga" className="bg-[var(--ag-color-bg-sunken)] text-foreground">
          {T["TXT-WIT-201"]}
        </RoleChip>
      </header>

      {steps && (
        <div className="app-steps">
          <Stepper steps={steps} />
        </div>
      )}

      {screen.name === "capture" && (
        <Capture
          client={client}
          state={capture}
          update={update}
          withPermission={withPermission}
          onSocial={() => setScreen({ name: "social" })}
          onContinue={() => void toDraft()}
          onRetry={!pack && !packLoading ? () => setPackAttempt((n) => n + 1) : undefined}
          busy={busy || packLoading || !pack}
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
          onSubmitted={(report) => {
            rememberReport(report.id);
            setScreen({ name: "submitted", report });
          }}
        />
      )}
      {screen.name === "submitted" && (
        <Submitted report={screen.report} onNew={restart} onMine={() => setScreen({ name: "mine" })} />
      )}
      {screen.name === "questions" && <Questions questions={questions} report={lastReport} onAnswer={answer} />}
      {screen.name === "mine" && (
        <MyReports
          client={client}
          pack={pack}
          questionCount={questions.length}
          onQuestions={openQuestions}
          onNew={restart}
        />
      )}
      {screen.name === "language" && <Language client={client} onDone={() => setScreen(screen.from)} />}

      {tab && (
        <BottomNav aria-label={T["TXT-WIT-209"]} className="app-nav">
          <BottomNavItem
            icon={CameraIcon}
            label={T["TXT-WIT-205"]}
            aria-current={current("capture")}
            onClick={() => goTab("capture")}
          />
          <BottomNavItem
            icon={ListIcon}
            label={T["TXT-WIT-206"]}
            aria-current={current("mine")}
            onClick={() => goTab("mine")}
          />
          <BottomNavItem
            icon={MessageCircleIcon}
            label={T["TXT-WIT-207"]}
            badge={questions.length}
            data-testid="nav-questions"
            aria-current={current("questions")}
            onClick={() => goTab("questions")}
          />
          <BottomNavItem icon={CircleHelpIcon} label={T["TXT-WIT-208"]} onClick={() => goTab("help")} />
        </BottomNav>
      )}

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
