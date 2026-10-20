import type { ReactNode } from "react";
import { useEffect, useRef } from "react";
import { T, t } from "./copy";
import type { IconName } from "./icons";
import { Icon } from "./icons";

type Tone = "info" | "warning" | "error" | "success";

const TONE_ICON: Record<Tone, IconName> = { info: "info", warning: "alert", error: "alert", success: "checkCircle" };

/** "Hasil AI (Agen Intake). Periksa …" -> ["Hasil AI (Agen Intake)", "Periksa …"]: title and text of a callout. */
export function splitFirstSentence(text: string): [string, string] {
  const at = text.indexOf(". ");
  return at < 0 ? [text, ""] : [text.slice(0, at), text.slice(at + 2)];
}

/** Callout title; a title split from its text keeps the full stop for screen readers and text search. */
function CalloutTitle({ text, split }: { text: string; split: boolean }) {
  return (
    <p className="callout-title">
      {text}
      {split && <span className="visually-hidden">. </span>}
    </p>
  );
}

/**
 * Callout: icon + optional title + text. Errors are announced (role=alert), the rest politely (role=status).
 * `split` shows the first sentence of a text message as the title (the mockups' two-line callouts).
 */
export function Notice({
  tone,
  title,
  children,
  testId,
  split = false,
}: {
  tone: Tone;
  title?: string;
  children?: ReactNode;
  testId?: string;
  split?: boolean;
}) {
  let heading = title;
  let body = children;
  const splitting = split && !title && typeof children === "string" && children.includes(". ");
  if (splitting) [heading, body] = splitFirstSentence(children as string);
  return (
    <div className={`callout callout--${tone}`} role={tone === "error" ? "alert" : "status"} data-testid={testId}>
      <Icon name={TONE_ICON[tone]} size={20} />
      <div className="callout-body">
        {heading && <CalloutTitle text={heading} split={splitting} />}
        {body !== undefined && body !== "" && <p>{body}</p>}
      </div>
    </div>
  );
}

/** Marks agent output. Text label and a neutral icon (no sparkles); the reporter can always correct it. */
export function AiResultLabel({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="callout callout--ai" data-testid="ai-result-label">
      <Icon name="cpu" size={20} />
      <div className="callout-body">
        <CalloutTitle text={title} split={!!children} />
        {children && <p>{children}</p>}
      </div>
    </div>
  );
}

/** Small AI tag (label + neutral icon) for one item, e.g. a transcript or an audit question. */
export function AiTag({ children }: { children: ReactNode }) {
  return (
    <span className="tag tag--ai">
      <Icon name="cpu" size={14} />
      {children}
    </span>
  );
}

/** "Dugaan" / "Didukung bukti" / "Terbukti": the same shape, colour and icon on every screen. */
export function EvidenceBadge({ level = "alleged" }: { level?: "alleged" | "supported" | "proven" }) {
  const [icon, text]: [IconName, string] =
    level === "proven"
      ? ["shield", T["TXT-EVD-003"]]
      : level === "supported"
        ? ["file", T["TXT-EVD-002"]]
        : ["help", T["TXT-EVD-001"]];
  return (
    <span className={`evidence-badge evidence-badge--${level}`}>
      <Icon name={icon} size={16} />
      {text}
    </span>
  );
}

export function SimulationBand({ testId = "simulation-band" }: { testId?: string | null }) {
  return (
    <div className="sim-band" role="note" data-testid={testId ?? undefined}>
      <Icon name="info" size={16} />
      {T["TXT-WIT-002"]}
    </div>
  );
}

export function AppHeader() {
  return (
    <header className="app-header">
      <img className="app-logo" src="/logo-mark.png" alt="" width={28} height={28} />
      <span className="app-name">{T["TXT-WIT-001"]}</span>
      <span className="chip">{T["TXT-WIT-400"]}</span>
    </header>
  );
}

/** "1 Bukti — 2 Periksa — 3 Terkirim" over the reporting flow. */
export function Stepper({ step }: { step: 1 | 2 | 3 }) {
  const steps = [T["TXT-WIT-402"], T["TXT-WIT-403"], T["TXT-WIT-404"]];
  return (
    <ol className="stepper" aria-label={T["TXT-WIT-401"]}>
      {steps.map((name, index) => {
        const n = index + 1;
        const state = n < step ? "done" : n === step ? "current" : "todo";
        return (
          <li key={name} className={`step step--${state}`} aria-current={state === "current" ? "step" : undefined}>
            <span className="step-dot">{state === "done" ? <Icon name="check" size={16} /> : n}</span>
            <span className="step-name">{name}</span>
          </li>
        );
      })}
    </ol>
  );
}

export type Tab = "report" | "reports" | "questions" | "help";

const TABS: { id: Tab; icon: IconName; text: () => string }[] = [
  { id: "report", icon: "camera", text: () => T["TXT-WIT-406"] },
  { id: "reports", icon: "list", text: () => T["TXT-WIT-160"] },
  { id: "questions", icon: "message", text: () => T["TXT-WIT-407"] },
  { id: "help", icon: "help", text: () => T["TXT-WIT-408"] },
];

export function TabBar({ active, onSelect }: { active: Tab; onSelect: (tab: Tab) => void }) {
  return (
    <nav className="tabbar" aria-label={T["TXT-WIT-405"]}>
      {TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className="tab"
          aria-current={active === tab.id ? "page" : undefined}
          onClick={() => onSelect(tab.id)}
        >
          <span className="tab-icon">
            <Icon name={tab.icon} />
          </span>
          <span className="tab-name">{tab.text()}</span>
        </button>
      ))}
    </nav>
  );
}

/** "Ada {n} pertanyaan audit untuk Anda / Jawab pertanyaan": opens SCR-006 while a question waits. */
export function QuestionsBanner({ count, onOpen }: { count: number; onOpen: () => void }) {
  return (
    <button type="button" className="banner callout callout--info" data-testid="audit-questions-banner" onClick={onOpen}>
      <Icon name="info" size={20} />
      <span className="callout-body">
        <span className="callout-title">
          {t("TXT-WIT-147", { jumlah: count })}
          <span className="visually-hidden"> · </span>
        </span>
        <span className="banner-action">{T["TXT-WIT-148"]}</span>
      </span>
    </button>
  );
}

/** Empty state: logo mark, title, short text, optional action. */
export function EmptyState({
  title,
  children,
  action,
  testId,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  testId?: string;
}) {
  return (
    <div className="empty" data-testid={testId}>
      <img src="/logo-mark.png" alt="" width={56} height={56} />
      <p className="empty-title">{title}</p>
      {children && <p className="empty-text">{children}</p>}
      {action}
    </div>
  );
}

/**
 * Confirmation before a destructive step (agesoa-uiux dialogs.json, e.g. PRV-remove): title, consequence, the action
 * and "Batal". Focus starts on the title so nothing is pre-selected; Escape cancels.
 */
export function ConfirmDialog({
  title,
  children,
  confirm,
  onConfirm,
  onCancel,
  testId,
}: {
  title: string;
  children: ReactNode;
  confirm: string;
  onConfirm: () => void;
  onCancel: () => void;
  testId?: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal?.();
    return () => element?.close?.();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="confirm"
      aria-labelledby="confirm-title"
      aria-describedby="confirm-body"
      data-testid={testId}
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
    >
      <h2 id="confirm-title" tabIndex={-1} autoFocus>
        {title}
      </h2>
      <p id="confirm-body">{children}</p>
      <div className="confirm-actions">
        <button type="button" className="button grow" onClick={onCancel}>
          {T["TXT-WIT-257"]}
        </button>
        <button type="button" className="button primary grow" onClick={onConfirm}>
          {confirm}
        </button>
      </div>
    </dialog>
  );
}
