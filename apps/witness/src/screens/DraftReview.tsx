/**
 * SCR-004 Review the Agen Intake draft: every field can be corrected, the rule check is computed by the service
 * (code, not the model), then the reporter submits.
 */

import { useRef, useState } from "react";
import type { FieldValue, IngestionClient, PackDocument, PackField, PackSummary, Report, ReportPatch } from "../api";
import { ApiError } from "../api";
import { AiResultLabel, AiTag, Notice, RegionName } from "../components";
import { evidenceKind, pick, T, t } from "../copy";
import type { IconName } from "../icons";
import { Icon } from "../icons";
import { fieldInError, fromInput, sameValue, toInput, vocabularyOf } from "../fields";

const INPUT_TYPE: Record<PackField["type"], string> = {
  string: "text",
  string_list: "text",
  datetime: "datetime-local",
  date: "date",
  integer: "number",
};

function inputsOf(pack: PackDocument, report: Report): Record<string, string> {
  return Object.fromEntries(
    pack.report_fields.map((f) => [f.id, toInput(f.type, report.fields[f.id], vocabularyOf(pack, f.id))]),
  );
}

export function DraftReview({
  client,
  pack: initialPack,
  packs,
  loadPack,
  onIssueType,
  initial,
  intakeFailed: initialIntakeFailed,
  onSubmitted,
}: {
  client: IngestionClient;
  pack: PackDocument;
  /** Issue types (domain packs) on offer; the picker is shown only when there is more than one. */
  packs: PackSummary[] | null;
  loadPack: (id: string) => Promise<PackDocument>;
  /** The reporter moved the draft to another issue type (remembered on the device). */
  onIssueType: (id: string) => void;
  initial: Report;
  intakeFailed: boolean;
  onSubmitted: (report: Report) => void;
}) {
  const [pack, setPack] = useState(initialPack);
  const [intakeFailed, setIntakeFailed] = useState(initialIntakeFailed);
  const [retyped, setRetyped] = useState(false);
  const [report, setReport] = useState(initial);
  const [category, setCategory] = useState(initial.category ?? "");
  const [inputs, setInputs] = useState(() => inputsOf(pack, initial));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
    const saved = await client.patchReport(report.id, patch);
    setReport(saved);
    setInputs(inputsOf(pack, saved));
    setCustomFields((current) =>
      (saved.custom_fields ?? []).map((field, index) => ({ ...field, key: current[index]?.key ?? crypto.randomUUID() })),
    );
    return saved;
  };

  /** Moves the draft to another pack, then lets Agen Intake draft it again with that pack's categories and fields. */
  const changeIssueType = async (id: string) => {
    if (id === report.domain) return;
    setError(null);
    setBadField(null);
    setBusy(true);
    try {
      const nextPack = await loadPack(id);
      let next = await client.patchReport(report.id, { domain: id });
      let failed = false;
      try {
        next = await client.runIntake(report.id);
      } catch (err) {
        if (!(err instanceof ApiError && err.status === 503)) throw err;
        failed = true; // fill the new fields by hand
      }
      setPack(nextPack);
      setReport(next);
      setCategory(next.category ?? "");
      setInputs(inputsOf(nextPack, next));
      setIntakeFailed(failed);
      setRetyped(true);
      onIssueType(id);
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  const run = async (submit: boolean) => {
    setError(null);
    setBadField(null);
    if (submit && !category) {
      setError(T["TXT-WIT-095"]);
      return;
    }
    setCustomError(null);
    const seen = new Set<string>();
    for (const field of customFields) {
      const normalized = field.label.trim().toLocaleLowerCase();
      if (!normalized || !field.value.trim() || seen.has(normalized)) {
        setCustomError(field.key);
        setError(seen.has(normalized) ? T["TXT-WIT-281"] : T["TXT-WIT-280"]);
        const part = !normalized || seen.has(normalized) ? "label" : "value";
        document.getElementById(`custom-${part}-${field.key}`)?.focus();
        return;
      }
      seen.add(normalized);
    }
    setBusy(true);
    try {
      const saved = await save();
      if (submit && saved) onSubmitted(await client.submit(saved.id));
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  const corrected = (id: string) =>
    !!report.intake && id in report.fields && !sameValue(report.fields[id], report.intake.fields[id]);

  const [aiTitle, aiBody] = splitFirstSentence(T["TXT-WIT-081"]);

  return (
    <main className="screen" data-screen="SCR-004">
      <h1>{T["TXT-WIT-080"]}</h1>
      {intakeFailed || !report.intake ? (
        <Notice tone="warning">{T["TXT-WIT-082"]}</Notice>
      ) : (
        <AiResultLabel title={aiTitle}>{aiBody}</AiResultLabel>
      )}
      {report.region && <RegionName region={report.region} synthetic={report.synthetic} />}
      {report.narrative && <blockquote className="narrative">{report.narrative}</blockquote>}
      {report.intake?.transcript && (
        <section aria-labelledby="transcript-heading">
          <h2 id="transcript-heading" className="visually-hidden">
            {T["TXT-WIT-096"]}
          </h2>
          <AiTag>{T["TXT-WIT-096"]}</AiTag>
          <blockquote className="narrative">{report.intake.transcript}</blockquote>
        </section>
      )}

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void run(true);
        }}
      >
        {packs && packs.length > 1 && (
          <div className="field">
            <label className="field-label" htmlFor="issue-type">
              {T["TXT-WIT-260"]}
            </label>
            <select
              id="issue-type"
              data-testid="issue-type"
              value={report.domain}
              disabled={busy}
              aria-describedby="issue-type-hint"
              onChange={(event) => void changeIssueType(event.target.value)}
            >
              {packs.map((p) => (
                <option key={p.id} value={p.id}>
                  {pick(p.name) || p.id}
                </option>
              ))}
            </select>
            <p className="field-hint" id="issue-type-hint" role={retyped ? "status" : undefined}>
              {T[retyped ? "TXT-WIT-262" : "TXT-WIT-261"]}
            </p>
          </div>
        )}

        <div className="field">
          <label className="field-label" htmlFor="draft-category">
            {T["TXT-WIT-083"]} <span className="required">({T["TXT-WIT-085"]})</span>
          </label>
          <select id="draft-category" value={category} onChange={(event) => setCategory(event.target.value)}>
            <option value="">{T["TXT-WIT-084"]}</option>
            {pack.categories.map((c) => (
              <option key={c.id} value={c.id}>
                {pick(c.label)}
              </option>
            ))}
          </select>
        </div>

        {pack.report_fields.map((f) => (
          <div className="field" key={f.id}>
            <label className="field-label" htmlFor={`draft-${f.id}`}>
              {pick(f.label)}
              {f.required && <span className="required"> ({T["TXT-WIT-085"]})</span>}
            </label>
            <input
              id={`draft-${f.id}`}
              name={f.id}
              type={INPUT_TYPE[f.type]}
              min={f.type === "integer" ? 0 : undefined}
              inputMode={f.type === "integer" ? "numeric" : undefined}
              value={inputs[f.id] ?? ""}
              aria-invalid={badField === f.id}
              aria-describedby={f.hint || f.type === "string_list" ? `draft-${f.id}-hint` : undefined}
              data-corrected={corrected(f.id) || undefined}
              onChange={(event) => setInputs((current) => ({ ...current, [f.id]: event.target.value }))}
            />
            {(f.hint || f.type === "string_list") && (
              <p className="field-hint" id={`draft-${f.id}-hint`}>
                {f.type === "string_list" ? T["TXT-WIT-086"] : pick(f.hint)}
              </p>
            )}
            {corrected(f.id) && <span className="tag tag--corrected">{T["TXT-WIT-097"]}</span>}
          </div>
        ))}

        {report.missing_required.length > 0 && (
          <Notice tone="info" testId="missing-required">
            {t("TXT-WIT-099", { kolom: report.missing_required.map(label).join(", ") })}
          </Notice>
        )}

        <fieldset className="field custom-fields" disabled={busy}>
          <legend className="field-label">{T["TXT-WIT-270"]}</legend>
          <p className="field-hint" id="custom-fields-hint">
            {T["TXT-WIT-271"]}
          </p>
          {customFields.length === 0 && <p className="field-hint">{T["TXT-WIT-272"]}</p>}
          {customFields.map((field, index) => (
            <section className="custom-field" key={field.key} aria-labelledby={`custom-heading-${field.key}`}>
              <h3 id={`custom-heading-${field.key}`}>{t("TXT-WIT-273", { nomor: String(index + 1) })}</h3>
              <div className="field">
                <label className="field-label" htmlFor={`custom-label-${field.key}`}>
                  {T["TXT-WIT-274"]}
                </label>
                <input
                  id={`custom-label-${field.key}`}
                  type="text"
                  maxLength={80}
                  required
                  placeholder={T["TXT-WIT-275"]}
                  value={field.label}
                  aria-invalid={customError === field.key}
                  aria-describedby="custom-fields-hint"
                  onChange={(event) => editCustomField(field.key, { label: event.target.value })}
                />
              </div>
              <div className="field">
                <label className="field-label" htmlFor={`custom-value-${field.key}`}>
                  {T["TXT-WIT-276"]}
                </label>
                <textarea
                  id={`custom-value-${field.key}`}
                  rows={2}
                  maxLength={2000}
                  required
                  placeholder={T["TXT-WIT-277"]}
                  value={field.value}
                  aria-invalid={customError === field.key}
                  onChange={(event) => editCustomField(field.key, { value: event.target.value })}
                />
              </div>
              <button
                type="button"
                className="button"
                aria-label={t("TXT-WIT-278", { nomor: String(index + 1) })}
                onClick={() => {
                  setCustomFields((current) => current.filter((item) => item.key !== field.key));
                  setCustomError(null);
                  requestAnimationFrame(() => addFieldButton.current?.focus());
                }}
              >
                {T["TXT-WIT-283"]}
              </button>
            </section>
          ))}
          <p className="field-hint" role="status">
            {customFields.length}/20 {T["TXT-WIT-279"]}
          </p>
          <button
            ref={addFieldButton}
            type="button"
            className="button wide"
            disabled={customFields.length >= 20}
            onClick={addCustomField}
          >
            {T["TXT-WIT-282"]}
          </button>
        </fieldset>

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

        {report.evidence.length > 0 && (
          <section aria-labelledby="evidence-heading">
            <h2 id="evidence-heading">{T["TXT-WIT-092"]}</h2>
            <ul className="items">
              {report.evidence.map((e) => (
                <li key={e.evidence_id} className="item">
                  <span className="item-thumb">
                    <Icon name={e.kind === "audio" ? "mic" : "image"} />
                  </span>
                  <span className="item-body">
                    <span className="item-name">{evidenceKind(e.kind)}</span>
                    <span className="item-meta mono">{e.sha256.slice(0, 16)}…</span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
        {report.shared_post && (
          <div className="item">
            <span className="item-thumb">
              <Icon name="link" />
            </span>
            <p className="item-body">
              <span className="item-name">{T["TXT-WIT-069"]}:</span>{" "}
              <span className="item-meta mono">{report.shared_post.url}</span>
            </p>
          </div>
        )}

        <div className="actions">
          {error && <Notice tone="error">{error}</Notice>}
          <button type="submit" className="button primary lg wide" disabled={busy}>
            {T["TXT-WIT-094"]}
          </button>
          <button type="button" className="button wide" disabled={busy} onClick={() => void run(false)}>
            {T["TXT-WIT-093"]}
          </button>
        </div>
      </form>
    </main>
  );
}

/** "Hasil AI (Agen Intake). Periksa …" -> ["Hasil AI (Agen Intake)", "Periksa …"]: title and text of the marker. */
export function splitFirstSentence(text: string): [string, string] {
  const at = text.indexOf(". ");
  return at < 0 ? [text, ""] : [text.slice(0, at), text.slice(at + 2)];
}
