/**
 * AGESOA Witness: anonymous citizen reporting.
 * SCR-001 record evidence -> (SCR-002 permission explainer) -> (SCR-003 social link / screenshot)
 * -> SCR-004 review the Agen Intake draft -> SCR-005 submitted.
 * Tabs: Lapor (the flow above), Laporan saya (SCR-008), Pertanyaan (SCR-006 audit questions, also reachable from the
 * banner once Agen Audit has a question for this device) and Bantuan (help, SCR-009 language and region).
 */

import { useEffect, useMemo, useState } from "react";
import type { PackDocument, PackSummary, Report, WitnessQuestion } from "./api";
import { ApiError, CaseAuditClient, IngestionClient } from "./api";
import type { Tab } from "./components";
import { AppHeader, Notice, SimulationBand, Stepper, TabBar } from "./components";
import type { WitnessConfig } from "./config";
import type { Language } from "./copy";
import { language, setLanguage, T, t } from "./copy";
import type { Capability } from "./device";
import { permissionStatus } from "./device";
import { Icon } from "./icons";
import { saveLanguage, suggestedLanguage } from "./language";
import { saveIssueType, savedIssueType } from "./issueType";
import { lastReportId, rememberReport, reportIds } from "./reports";
import { Capture } from "./screens/Capture";
import { DraftReview } from "./screens/DraftReview";
import { Help } from "./screens/Help";
import { LanguageRegion } from "./screens/LanguageRegion";
import { MyReports } from "./screens/MyReports";
import { PermissionExplainer } from "./screens/PermissionExplainer";
import { Questions } from "./screens/Questions";
import { SharedPost } from "./screens/SharedPost";
import { Submitted } from "./screens/Submitted";
import type { CaptureState } from "./state";
import { EMPTY_CAPTURE, hasContent } from "./state";

/** The reporting flow under the Lapor tab. */
type Screen =
  | { name: "capture" }
  | { name: "social" }
  | { name: "draft"; report: Report; intakeFailed: boolean }
  | { name: "submitted"; report: Report };

const STEP: Record<Screen["name"], 1 | 2 | 3> = { capture: 1, social: 1, draft: 2, submitted: 3 };

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

/** The default issue type first, then the others by id (stable order for the picker). */
export function orderPacks(list: PackSummary[], first: string): PackSummary[] {
  return [...list].sort((a, b) => Number(b.id === first) - Number(a.id === first) || a.id.localeCompare(b.id));
}

export default function App({ config }: { config: WitnessConfig }) {
  const client = useMemo(() => new IngestionClient(config), [config]);
  const audit = useMemo(() => new CaseAuditClient(config), [config]);
  const [screen, setScreen] = useState<Screen>({ name: "capture" });
  const [capture, setCapture] = useState<CaptureState>(EMPTY_CAPTURE);
  const [pack, setPack] = useState<PackDocument | null>(null);
  // Issue type (domain pack) of the report being made, and every loaded pack (SCR-008 shows reports of any type).
  const [domain, setDomain] = useState(() => savedIssueType() ?? config.domain);
  const [packs, setPacks] = useState<PackSummary[] | null>(null);
  const [packDocs, setPackDocs] = useState<Record<string, PackDocument>>({});
  const [explained, setExplained] = useState<Capability[]>([]);
  const [pending, setPending] = useState<PendingPermission | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [questions, setQuestions] = useState<WitnessQuestion[]>([]);
  const [lastReport, setLastReport] = useState<Report | null>(null);
  const [tab, setTab] = useState<Tab>("report");
  const [helpView, setHelpView] = useState<"help" | "language">("help");
  const [lang, setLang] = useState<Language>(language);
  const [myReports, setMyReports] = useState<string[]>(() => reportIds());

  // Questions appear after the report has been grouped into a case, so look again while the app is open. An
  // unreachable audit service never blocks reporting: the banner just stays away.
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

  // The issue types on offer; the configured default first. Without the list the app keeps working on the default.
  useEffect(() => {
    client.packs().then(
      (list) => {
        const sorted = orderPacks(list, config.domain);
        setPacks(sorted);
        setDomain((current) => (sorted.some((p) => p.id === current) || sorted.length === 0 ? current : sorted[0].id));
        for (const summary of sorted) {
          client.pack(summary.id).then(
            (doc) => setPackDocs((docs) => ({ ...docs, [doc.id]: doc })),
            () => undefined,
          );
        }
      },
      () => setPacks(null),
    );
  }, [client, config.domain]);

  useEffect(() => {
    let live = true;
    setPack(null);
    client.pack(domain).then(
      (doc) => {
        if (!live) return;
        setPack(doc);
        setPackDocs((docs) => ({ ...docs, [doc.id]: doc }));
      },
      (err) => live && setError(messageFor(err)),
    );
    return () => {
      live = false;
    };
  }, [client, domain]);

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
          domain,
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
    setTab("report");
  };

  const openQuestions = () => {
    setTab("questions");
    const id = lastReportId();
    // The status card is a courtesy: an unreachable or unknown report never blocks answering.
    if (id) client.getReport(id).then(setLastReport, () => setLastReport(null));
  };

  const selectTab = (next: Tab) => {
    if (next === "questions") openQuestions();
    else setTab(next);
    if (next === "help") setHelpView("help");
    window.scrollTo?.({ top: 0 });
  };

  const changeLanguage = (next: Language) => {
    saveLanguage(next);
    setLanguage(next);
    setLang(next);
    setHelpView("help");
  };

  const reporting = tab === "report";
  // SCR-004 works with the pack of its own report; switching the issue type there must not unmount the screen.
  const draftPack =
    screen.name === "draft" ? (packDocs[screen.report.domain] ?? (pack?.id === screen.report.domain ? pack : null)) : null;
  const loadPack = (id: string): Promise<PackDocument> =>
    packDocs[id]
      ? Promise.resolve(packDocs[id])
      : client.pack(id).then((doc) => {
          setPackDocs((docs) => ({ ...docs, [doc.id]: doc }));
          return doc;
        });
  // Focus steps (link, draft review, language form) hide the tab bar so the screen's own actions stay in reach.
  const showTabs = !(reporting && (screen.name === "social" || screen.name === "draft")) && !(tab === "help" && helpView === "language");
  const showBanner =
    questions.length > 0 && ((reporting && (screen.name === "capture" || screen.name === "submitted")) || tab === "reports");

  return (
    <div className={showTabs ? "app has-tabs" : "app"} lang={lang}>
      {config.demoMode && <SimulationBand />}
      <AppHeader />
      {reporting && <Stepper step={STEP[screen.name]} />}

      {showBanner && (
        <button
          type="button"
          className="banner"
          data-testid="audit-questions-banner"
          onClick={openQuestions}
        >
          <Icon name="message" size={20} />
          <span className="banner-text">
            <span className="banner-title">{t("TXT-WIT-147", { jumlah: questions.length })}</span>
            <span className="banner-sep" aria-hidden="true">
              {" · "}
            </span>
            <span className="banner-action">{T["TXT-WIT-148"]}</span>
          </span>
          <Icon name="chevronRight" size={20} />
        </button>
      )}

      {reporting && screen.name === "capture" && (
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
      {reporting && screen.name === "social" && (
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
      {reporting && screen.name === "draft" && draftPack && (
        <DraftReview
          client={client}
          pack={draftPack}
          packs={packs}
          loadPack={loadPack}
          onIssueType={(id) => {
            saveIssueType(id);
            setDomain(id);
          }}
          initial={screen.report}
          intakeFailed={screen.intakeFailed}
          onSubmitted={(report) => {
            rememberReport(report.id);
            setMyReports(reportIds());
            setScreen({ name: "submitted", report });
          }}
        />
      )}
      {reporting && screen.name === "submitted" && (
        <Submitted report={screen.report} onNew={restart} onMyReports={() => selectTab("reports")} />
      )}
      {reporting && !pack && error && screen.name !== "capture" && <Notice tone="error">{error}</Notice>}

      {tab === "reports" && (
        <MyReports
          client={client}
          ids={myReports}
          packs={packDocs}
          onNew={() => (screen.name === "submitted" ? restart() : selectTab("report"))}
        />
      )}
      {tab === "questions" && <Questions questions={questions} report={lastReport} onAnswer={answer} />}
      {tab === "help" && helpView === "help" && <Help onLanguage={() => setHelpView("language")} />}
      {tab === "help" && helpView === "language" && (
        <LanguageRegion
          current={lang}
          suggested={suggestedLanguage(typeof navigator === "undefined" ? [] : navigator.languages ?? [])}
          onSave={changeLanguage}
          onCancel={() => setHelpView("help")}
        />
      )}

      {showTabs && <TabBar active={tab} onSelect={selectTab} waiting={questions.length} />}

      {pending && (
        <PermissionExplainer
          kind={pending.kind}
          demoMode={config.demoMode}
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
