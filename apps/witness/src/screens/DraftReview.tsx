import { button, pill } from "../ui";
/**
 * SCR-004 Review the Agen Intake draft: every field can be corrected, the rule check is computed by the service
 * (code, not the model), then the reporter submits.
 */

import { useState } from "react";
import type { FieldValue, IngestionClient, PackDocument, PackField, Report, ReportPatch } from "../api";
import { ApiError } from "../api";
import { AiResultLabel, Notice, RegionName } from "../components";
import { EVIDENCE_KIND, T, t } from "../copy";
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
  pack,
  initial,
  intakeFailed,
  onSubmitted,
}: {
  client: IngestionClient;
  pack: PackDocument;
  initial: Report;
  intakeFailed: boolean;
  onSubmitted: (report: Report) => void;
}) {
  const [report, setReport] = useState(initial);
  const [category, setCategory] = useState(initial.category ?? "");
  const [inputs, setInputs] = useState(() => inputsOf(pack, initial));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [badField, setBadField] = useState<string | null>(null);

  const label = (id: string) => pack.report_fields.find((f) => f.id === id)?.label.id ?? id;

  const changes = (): ReportPatch => {
    const fields: Record<string, FieldValue | null> = {};
    for (const f of pack.report_fields) {
      const value = fromInput(f.type, inputs[f.id] ?? "", vocabularyOf(pack, f.id));
      if (!sameValue(value, report.fields[f.id])) fields[f.id] = value;
    }
    const patch: ReportPatch = {};
    if (Object.keys(fields).length) patch.fields = fields;
    if ((category || null) !== report.category) patch.category = category || null;
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
    return saved;
  };

  const run = async (submit: boolean) => {
    setError(null);
    setBadField(null);
    if (submit && !category) {
      setError(T["TXT-WIT-095"]);
      return;
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

  return (
    <main className="screen" data-screen="SCR-004">
      <h1>{T["TXT-WIT-080"]}</h1>
      {intakeFailed || !report.intake ? (
        <Notice tone="info">{T["TXT-WIT-082"]}</Notice>
      ) : (
        <AiResultLabel>{T["TXT-WIT-081"]}</AiResultLabel>
      )}
      {report.region && <RegionName region={report.region} synthetic={report.synthetic} />}
      {report.narrative && <blockquote className="narrative">{report.narrative}</blockquote>}
      {report.intake?.transcript && (
        <section>
          <h2>{T["TXT-WIT-096"]}</h2>
          <blockquote className="narrative">{report.intake.transcript}</blockquote>
        </section>
      )}

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void run(true);
        }}
      >
        <label className="field">
          <span className="field-label">
            {T["TXT-WIT-083"]} <span className="required">({T["TXT-WIT-085"]})</span>
          </span>
          <select value={category} onChange={(event) => setCategory(event.target.value)}>
            <option value="">{T["TXT-WIT-084"]}</option>
            {pack.categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label.id}
              </option>
            ))}
          </select>
        </label>

        {pack.report_fields.map((f) => (
          <label className="field" key={f.id}>
            <span className="field-label">
              {f.label.id}
              {f.required && <span className="required"> ({T["TXT-WIT-085"]})</span>}
              {corrected(f.id) && <span className="tag">{T["TXT-WIT-097"]}</span>}
            </span>
            {(f.hint || f.type === "string_list") && (
              <span className="field-hint">{f.type === "string_list" ? T["TXT-WIT-086"] : f.hint?.id}</span>
            )}
            <input
              name={f.id}
              type={INPUT_TYPE[f.type]}
              min={f.type === "integer" ? 0 : undefined}
              inputMode={f.type === "integer" ? "numeric" : undefined}
              value={inputs[f.id] ?? ""}
              aria-invalid={badField === f.id}
              onChange={(event) => setInputs((current) => ({ ...current, [f.id]: event.target.value }))}
            />
          </label>
        ))}

        {report.missing_required.length > 0 && (
          <Notice tone="info" testId="missing-required">
            {t("TXT-WIT-099", { kolom: report.missing_required.map(label).join(", ") })}
          </Notice>
        )}

        <section aria-labelledby="rules-heading" className="card">
          <h2 id="rules-heading">{T["TXT-WIT-087"]}</h2>
          <p className="field-hint">{T["TXT-WIT-088"]}</p>
          <ul className="plain">
            {report.rule_results.map((r) => {
              const rule = pack.rules.find((x) => x.id === r.rule_id);
              const [mark, text, tone] =
                r.violated === null
                  ? ["○", T["TXT-WIT-091"], "neutral"]
                  : r.violated
                    ? ["✕", T["TXT-WIT-089"], "error"]
                    : ["●", T["TXT-WIT-090"], "ok"];
              return (
                <li key={r.rule_id} data-testid={`rule-${r.rule_id}`} data-violated={String(r.violated)}>
                  <span className="rule-name">{rule?.label.id ?? r.rule_id}</span>
                  <span className={pill(tone as "ok" | "error" | "neutral")}>
                    <span aria-hidden="true">{mark}</span>
                    {text}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>

        {report.evidence.length > 0 && (
          <section aria-labelledby="evidence-heading">
            <h2 id="evidence-heading">{T["TXT-WIT-092"]}</h2>
            <ul className="plain">
              {report.evidence.map((e) => (
                <li key={e.evidence_id}>
                  {EVIDENCE_KIND[e.kind]} · <span className="mono">{e.sha256.slice(0, 16)}…</span>
                </li>
              ))}
            </ul>
          </section>
        )}
        {report.shared_post && (
          <p className="attached">
            {T["TXT-WIT-069"]}: <span className="mono">{report.shared_post.url}</span>
          </p>
        )}

        <div className="actions">
          {error && <Notice tone="error">{error}</Notice>}
          <button type="button" className={button("neutral", { wide: true })} disabled={busy} onClick={() => void run(false)}>
            {T["TXT-WIT-093"]}
          </button>
          <button type="submit" className={button("primary", { wide: true })} disabled={busy}>
            {T["TXT-WIT-094"]}
          </button>
        </div>
      </form>
    </main>
  );
}
