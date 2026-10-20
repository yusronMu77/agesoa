/**
 * SCR-004 Review the Agen Intake draft of a general report: the story, issue type and the pack's incident fields can
 * all be corrected, the reporter may add their own text fields, then submits. Any rule check is computed by the
 * service (code, not the model) and shown only when the pack has rules.
 */

import { useRef, useState } from "react";
import type { Evidence, FieldValue, IngestionClient, PackDocument, PackField, Report, ReportPatch } from "../api";
import { ApiError } from "../api";
import { AiResultLabel, Notice, splitFirstSentence } from "../components";
import { evidenceKind, pick, T, t } from "../copy";
import type { IconName } from "../icons";
import { Icon } from "../icons";
import { fieldInError, fromInput, sameValue, toInput, vocabularyOf } from "../fields";
import type { EvidenceItem } from "../state";

export { splitFirstSentence } from "../components";

const INPUT_TYPE: Record<PackField["type"], string> = {
  string: "text",
  string_list: "text",
  datetime: "datetime-local",
  date: "date",
  integer: "number",
};

const MAX_CUSTOM_FIELDS = 20;

function inputsOf(pack: PackDocument, report: Report): Record<string, string> {
  return Object.fromEntries(
    pack.report_fields.map((f) => [f.id, toInput(f.type, report.fields[f.id], vocabularyOf(pack, f.id))]),
  );
}

/** Name and note of one stored evidence file; the file name is known only on the device that picked it. */
export function evidenceRow(evidence: Evidence, local?: EvidenceItem): { icon: IconName; name: string; meta: string } {
  const name = local?.kind === "audio" || !local ? evidenceKind(evidence.kind) : local.name;
  if (evidence.kind === "audio") {
    return { icon: "mic", name, meta: local?.seconds ? t("TXT-WIT-296", { detik: local.seconds }) : "" };
  }
  if (evidence.kind === "screenshot") return { icon: "image", name, meta: T["TXT-WIT-295"] };
  return { icon: "image", name, meta: evidence.metadata_removed ? T["TXT-WIT-410"] : "" };
}

export function DraftReview({
  client,
  pack,
  initial,
  intakeFailed,
  items = [],
  onSubmitted,
}: {
  client: IngestionClient;
  pack: PackDocument;
  initial: Report;
  intakeFailed: boolean;
  /** Evidence picked on this device (file names, voice note length) for the attached evidence list. */
  items?: EvidenceItem[];
  onSubmitted: (report: Report) => void;
}) {
  const [report, setReport] = useState(initial);
  const [narrative, setNarrative] = useState(initial.narrative ?? "");
  const [category, setCategory] = useState(initial.category ?? "");
  const [inputs, setInputs] = useState(() => inputsOf(pack, initial));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [badField, setBadField] = useState<string | null>(null);
  // Reporter-defined extra fields (label + value as text), separate from the pack's fields and rules.
  const [customFields, setCustomFields] = useState(() =>
    (initial.custom_fields ?? []).map((field) => ({ ...field, key: crypto.randomUUID() })),
  );
  const [customError, setCustomError] = useState<string | null>(null);
  const addFieldButton = useRef<HTMLButtonElement>(null);

  const addCustomField = () => {
    const key = crypto.randomUUID();
    setCustomFields((current) => [...current, { key, label: "", value: "" }]);
    requestAnimationFrame(() => document.getElementById(`custom-label-${key}`)?.focus());
  };
  const editCustomField = (key: string, change: { label?: string; value?: string }) =>
    setCustomFields((current) => current.map((item) => (item.key === key ? { ...item, ...change } : item)));

  const label = (id: string) => {
    const field = pack.report_fields.find((f) => f.id === id);
    return field ? pick(field.label) : id;
  };

  const changes = (): ReportPatch => {
    const fields: Record<string, FieldValue | null> = {};
    for (const f of pack.report_fields) {
      const value = fromInput(f.type, inputs[f.id] ?? "", vocabularyOf(pack, f.id));
      if (!sameValue(value, report.fields[f.id])) fields[f.id] = value;
    }
    const patch: ReportPatch = {};
    if (Object.keys(fields).length) patch.fields = fields;
    if ((category || null) !== report.category) patch.category = category || null;
    if ((narrative.trim() || null) !== (report.narrative || null)) patch.narrative = narrative.trim() || null;
    const custom = customFields.map(({ label, value }) => ({ label: label.trim(), value: value.trim() }));
    if (JSON.stringify(custom) !== JSON.stringify(report.custom_fields ?? [])) patch.custom_fields = custom;
    return patch;
  };

  const fail = (err: unknown) => {
    if (err instanceof ApiError && err.status === 422) {
      const field = fieldInError(err.detail, pack.report_fields.map((f) => f.id));
      setBadField(field);
      setError(field ? t("TXT-WIT-098", { kolom: label(field) }) : err.detail);
    } else if (err instanceof ApiError && err.status === null) {
      setError(T["TXT-WIT-130"]);
    } else {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const save = async (): Promise<Report | null> => {
    const patch = changes();
    if (!Object.keys(patch).length) return report;
    const next = await client.patchReport(report.id, patch);
    setReport(next);
    setNarrative(next.narrative ?? "");
    setInputs(inputsOf(pack, next));
    setCustomFields((current) =>
      (next.custom_fields ?? []).map((field, index) => ({ ...field, key: current[index]?.key ?? crypto.randomUUID() })),
    );
    return next;
  };

  const run = async (submit: boolean) => {
    setError(null);
    setSaved(false);
    setBadField(null);
    if (submit && !category) {
      setError(T["TXT-WIT-095"]);
      document.getElementById("draft-category")?.focus();
      return;
    }
    setCustomError(null);
    const seen = new Set<string>();
    for (const field of customFields) {
      const normalized = field.label.trim().toLocaleLowerCase();
      if (!normalized || !field.value.trim() || seen.has(normalized)) {
        setCustomError(field.key);
        setError(seen.has(normalized) ? T["TXT-WIT-204"] : T["TXT-WIT-203"]);
        const part = !normalized || seen.has(normalized) ? "label" : "value";
        document.getElementById(`custom-${part}-${field.key}`)?.focus();
        return;
      }
      seen.add(normalized);
    }
    setBusy(true);
    try {
      const next = await save();
      if (submit && next) onSubmitted(await client.submit(next.id));
      else setSaved(true);
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  const corrected = (id: string) =>
    !!report.intake && id in report.fields && !sameValue(report.fields[id], report.intake.fields[id]);

  const [aiTitle, aiBody] = splitFirstSentence(T["TXT-WIT-081"]);
  const drafted = !intakeFailed && !!report.intake;
  // Intake ran but proposed nothing: the reporter fills the draft, without an AI marker on empty fields.
  const proposed =
    drafted && (!!report.intake?.category || Object.values(report.intake?.fields ?? {}).some((v) => v !== null));
  const missing = new Set(report.missing_required);
  const categoryHint = pick(pack.category_hint);
  const local = (e: Evidence) => items.find((item) => item.evidenceId === e.evidence_id);
  const hasRules = pack.rules.length > 0 || report.rule_results.length > 0;

  return (
    <main className="screen" data-screen="SCR-004" data-intake={drafted ? "done" : "failed"}>
      <h1>{T["TXT-WIT-080"]}</h1>
      {!drafted ? (
        <Notice tone="warning" split>
          {T["TXT-WIT-082"]}
        </Notice>
      ) : proposed ? (
        <AiResultLabel title={aiTitle}>{aiBody}</AiResultLabel>
      ) : (
        <Notice tone="info">{T["TXT-WIT-189"]}</Notice>
      )}

      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void run(true);
        }}
      >
        <section aria-labelledby="details-heading" className="fields">
          <h2 id="details-heading">{T["TXT-WIT-185"]}</h2>
          <div className="field">
            <label className="field-label" htmlFor="draft-narrative">
              {T["TXT-WIT-188"]}
            </label>
            <textarea
              id="draft-narrative"
              rows={3}
              maxLength={5000}
              placeholder={T["TXT-WIT-299"]}
              value={narrative}
              onChange={(event) => setNarrative(event.target.value)}
            />
          </div>

          <div className="field">
            <label className="field-label" htmlFor="draft-category">
              {T["TXT-WIT-083"]} ({T["TXT-WIT-085"]})
            </label>
            <span className={category ? "select" : "select select--placeholder"}>
              <select
                id="draft-category"
                value={category}
                aria-describedby={categoryHint ? "draft-category-hint" : undefined}
                onChange={(event) => setCategory(event.target.value)}
              >
                <option value="">{T["TXT-WIT-084"]}</option>
                {pack.categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {pick(c.label)}
                  </option>
                ))}
              </select>
              <Icon name="chevronDown" className="select-chevron" />
            </span>
            {categoryHint && (
              <p className="field-hint" id="draft-category-hint">
                {categoryHint}
              </p>
            )}
          </div>

          {pack.report_fields.map((f) => {
            const hint = f.type === "string_list" ? T["TXT-WIT-086"] : pick(f.hint);
            const placeholder = pick(f.placeholder);
            return (
              <div className="field" key={f.id}>
                <label className="field-label" htmlFor={`draft-${f.id}`}>
                  {pick(f.label)}
                  {f.required && ` (${T["TXT-WIT-085"]})`}
                </label>
                <input
                  id={`draft-${f.id}`}
                  name={f.id}
                  type={INPUT_TYPE[f.type]}
                  min={f.type === "integer" ? 0 : undefined}
                  inputMode={f.type === "integer" ? "numeric" : undefined}
                  placeholder={placeholder || undefined}
                  value={inputs[f.id] ?? ""}
                  aria-invalid={badField === f.id}
                  aria-describedby={hint ? `draft-${f.id}-hint` : undefined}
                  data-corrected={corrected(f.id) || undefined}
                  onChange={(event) => setInputs((current) => ({ ...current, [f.id]: event.target.value }))}
                />
                {hint && (
                  <p className="field-hint" id={`draft-${f.id}-hint`}>
                    {hint}
                  </p>
                )}
                {corrected(f.id) && <span className="tag tag--corrected">{T["TXT-WIT-097"]}</span>}
                {missing.has(f.id) && <span className="tag tag--warning">{T["TXT-WIT-193"]}</span>}
              </div>
            );
          })}

          {report.missing_required.length > 0 && (
            <Notice tone="info" testId="missing-required">
              {t("TXT-WIT-099", { kolom: report.missing_required.map(label).join(", ") })}
            </Notice>
          )}
        </section>

        <fieldset className="custom-fields" disabled={busy} aria-describedby="custom-fields-hint">
          <legend>
            <h2>{T["TXT-WIT-194"]}</h2>
          </legend>
          <p className="field-hint" id="custom-fields-hint">
            {T["TXT-WIT-195"]}
          </p>
          {customFields.length === 0 && <p className="field-hint">{T["TXT-WIT-196"]}</p>}
          {customFields.map((field, index) => (
            <section className="custom-field" key={field.key} aria-labelledby={`custom-heading-${field.key}`}>
              <h3 id={`custom-heading-${field.key}`}>{t("TXT-WIT-197", { nomor: String(index + 1) })}</h3>
              <div className="field">
                <label className="field-label" htmlFor={`custom-label-${field.key}`}>
                  {T["TXT-WIT-198"]}
                </label>
                <input
                  id={`custom-label-${field.key}`}
                  type="text"
                  maxLength={80}
                  required
                  placeholder={T["TXT-WIT-199"]}
                  value={field.label}
                  aria-invalid={customError === field.key}
                  aria-describedby={customError === field.key && !field.label.trim() ? `custom-label-${field.key}-error` : undefined}
                  onChange={(event) => editCustomField(field.key, { label: event.target.value })}
                />
                {customError === field.key && !field.label.trim() && (
                  <p className="field-error" id={`custom-label-${field.key}-error`}>
                    <Icon name="alert" size={16} />
                    {T["TXT-WIT-430"]}
                  </p>
                )}
              </div>
              <div className="field">
                <label className="field-label" htmlFor={`custom-value-${field.key}`}>
                  {T["TXT-WIT-200"]}
                </label>
                <textarea
                  id={`custom-value-${field.key}`}
                  rows={3}
                  maxLength={2000}
                  required
                  placeholder={T["TXT-WIT-201"]}
                  value={field.value}
                  aria-invalid={customError === field.key}
                  onChange={(event) => editCustomField(field.key, { value: event.target.value })}
                />
              </div>
              <button
                type="button"
                className="button wide"
                aria-label={t("TXT-WIT-202", { nomor: String(index + 1) })}
                onClick={() => {
                  setCustomFields((current) => current.filter((item) => item.key !== field.key));
                  setCustomError(null);
                  requestAnimationFrame(() => addFieldButton.current?.focus());
                }}
              >
                {T["TXT-WIT-206"]}
              </button>
            </section>
          ))}
          <p className="field-hint" role="status">
            {customFields.length}/{MAX_CUSTOM_FIELDS} {T["TXT-WIT-207"]}
          </p>
          <button
            ref={addFieldButton}
            type="button"
            className="button wide"
            disabled={customFields.length >= MAX_CUSTOM_FIELDS}
            onClick={addCustomField}
          >
            {T["TXT-WIT-205"]}
          </button>
        </fieldset>

        {hasRules && (
          <section aria-labelledby="rules-heading">
            <h2 id="rules-heading">{T["TXT-WIT-087"]}</h2>
            <p className="field-hint">{T["TXT-WIT-088"]}</p>
            <ul className="rules">
              {report.rule_results.map((r) => {
                const rule = pack.rules.find((x) => x.id === r.rule_id);
                const [icon, text, tone]: [IconName, string, string] =
                  r.violated === null
                    ? ["info", T["TXT-WIT-091"], "info"]
                    : r.violated
                      ? ["xCircle", T["TXT-WIT-089"], "error"]
                      : ["checkCircle", T["TXT-WIT-090"], "success"];
                return (
                  <li
                    key={r.rule_id}
                    className={`rule callout callout--${tone}`}
                    data-testid={`rule-${r.rule_id}`}
                    data-violated={String(r.violated)}
                  >
                    <Icon name={icon} size={20} />
                    <div className="callout-body">
                      <p className="callout-title">{text}</p>
                      <p className="rule-name">{rule ? pick(rule.label) : r.rule_id}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {(report.evidence.length > 0 || report.shared_post) && (
          <section aria-labelledby="evidence-heading">
            <h2 id="evidence-heading">{T["TXT-WIT-092"]}</h2>
            <ul className="items">
              {report.evidence.map((e) => {
                const row = evidenceRow(e, local(e));
                return (
                  <li key={e.evidence_id} className="item">
                    <span className="item-thumb">
                      <Icon name={row.icon} />
                    </span>
                    <span className="item-body">
                      <span className="item-name">{row.name}</span>
                      {row.meta && <span className="item-meta">{row.meta}</span>}
                    </span>
                  </li>
                );
              })}
              {report.shared_post && (
                <li className="item">
                  <span className="item-thumb">
                    <Icon name="link" />
                  </span>
                  <span className="item-body">
                    <span className="item-name">{T["TXT-WIT-061"]}</span>
                    <span className="item-meta item-meta--url">{report.shared_post.url}</span>
                  </span>
                </li>
              )}
            </ul>
          </section>
        )}
        {report.synthetic && <span className="tag tag--sim">{T["TXT-WIT-118"]}</span>}

        <div className="actions">
          {error && <Notice tone="error">{error}</Notice>}
          {saved && !error && (
            <Notice tone="success" title={T["TXT-WIT-436"]} testId="draft-saved">
              {`${T["TXT-WIT-190"]} ${T["TXT-WIT-437"]}`}
            </Notice>
          )}
          <button type="button" className="button wide" disabled={busy} onClick={() => void run(false)}>
            {T["TXT-WIT-093"]}
          </button>
          {/* Looks disabled until an issue type is chosen, but stays usable and says why when pressed. */}
          <button type="submit" className={category ? "button primary wide" : "button primary wide is-blocked"} disabled={busy}>
            {T["TXT-WIT-094"]}
          </button>
        </div>
      </form>
    </main>
  );
}
