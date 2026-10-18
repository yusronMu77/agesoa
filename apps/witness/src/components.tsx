import type { ReactNode } from "react";
import type { District } from "./api";
import { T } from "./copy";
import type { IconName } from "./icons";
import { Icon } from "./icons";

type Tone = "info" | "warning" | "error" | "success";

const TONE_ICON: Record<Tone, IconName> = { info: "info", warning: "alert", error: "alert", success: "checkCircle" };

/** Callout: icon + optional title + text. Errors are announced (role=alert), the rest politely (role=status). */
export function Notice({
  tone,
  title,
  children,
  testId,
}: {
  tone: Tone;
  title?: string;
  children?: ReactNode;
  testId?: string;
}) {
  return (
    <div className={`callout callout--${tone}`} role={tone === "error" ? "alert" : "status"} data-testid={testId}>
      <Icon name={TONE_ICON[tone]} size={20} />
      <div className="callout-body">
        {title && <p className="callout-title">{title}</p>}
        {children !== undefined && <p>{children}</p>}
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
        <p className="callout-title">{title}</p>
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

export function RegionName({ region, synthetic }: { region: District; synthetic: boolean }) {
  return (
    <p className="region" data-testid="region">
      <Icon name="pin" size={20} />
      <span>
        <strong>{region.district_name}</strong>, {region.regency_name}
        {synthetic && <span className="tag tag--sim">{T["TXT-WIT-118"]}</span>}
      </span>
    </p>
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
      <img className="app-logo" src="/logo-mark.png" alt="" width={36} height={36} />
      <span className="app-name">{T["TXT-WIT-001"]}</span>
      <span className="chip">{T["TXT-WIT-200"]}</span>
    </header>
  );
}

/** "1 Bukti — 2 Periksa — 3 Terkirim" over the reporting flow. */
export function Stepper({ step }: { step: 1 | 2 | 3 }) {
  const steps = [T["TXT-WIT-202"], T["TXT-WIT-203"], T["TXT-WIT-204"]];
  return (
    <ol className="stepper" aria-label={T["TXT-WIT-201"]}>
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
  { id: "report", icon: "camera", text: () => T["TXT-WIT-206"] },
  { id: "reports", icon: "list", text: () => T["TXT-WIT-160"] },
  { id: "questions", icon: "message", text: () => T["TXT-WIT-207"] },
  { id: "help", icon: "help", text: () => T["TXT-WIT-208"] },
];

export function TabBar({ active, onSelect, waiting }: { active: Tab; onSelect: (tab: Tab) => void; waiting: number }) {
  return (
    <nav className="tabbar" aria-label={T["TXT-WIT-205"]}>
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
            {tab.id === "questions" && waiting > 0 && <span className="tab-count">{waiting}</span>}
          </span>
          <span className="tab-name">{tab.text()}</span>
        </button>
      ))}
    </nav>
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
      <img src="/logo-mark.png" alt="" width={80} height={80} />
      <p className="empty-title">{title}</p>
      {children && <p className="empty-text">{children}</p>}
      {action}
    </div>
  );
}
