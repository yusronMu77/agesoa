import { AttachmentRow } from "@agesoa/ui/components/attachment-row";
import { AiMarker } from "@agesoa/ui/components/ai-marker";
import { Input } from "@agesoa/ui/components/input";
import { NativeSelect } from "@agesoa/ui/components/native-select";
import { Textarea } from "@agesoa/ui/components/textarea";
import { cn } from "@agesoa/ui/lib/utils";
import { ImageIcon, LinkIcon, MicIcon } from "lucide-react";
import { button } from "../ui";
/**
 * SCR-004 Review the Agen Intake draft: every field can be corrected, the rule check is computed by the service
 * (code, not the model), then the reporter submits.
 */

import { useRef, useState } from "react";
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
  enum: "text",
};

const EVIDENCE_ICON = { photo: ImageIcon, audio: MicIcon, screenshot: ImageIcon } as const;

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
  const [narrative, setNarrative] = useState(initial.narrative ?? initial.intake?.transcript ?? "");
  const [category, setCategory] = useState(initial.category ?? "");
  const [inputs, setInputs] = useState(() => inputsOf(pack, initial));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [badField, setBadField] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
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
    if ((narrative.trim() || null) !== report.narrative) patch.narrative = narrative.trim() || null;
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
    setCategory(saved.category ?? "");
    setNarrative(saved.narrative ?? "");
    setCustomFields((current) => (saved.custom_fields ?? []).map((field, index) => ({
      ...field, key: current[index]?.key ?? crypto.randomUUID(),
    })));
    return saved;
  };

  const run = async (submit: boolean) => {
    if (busy) return;
    setError(null);
    setStatus(null);
    setBadField(null);
    setCustomError(null);
    const seen = new Set<string>();
    for (const field of customFields) {
      const normalized = field.label.trim().toLocaleLowerCase();
      if (!normalized || !field.value.trim() || seen.has(normalized)) {
        setCustomError(field.key);
        setError(seen.has(normalized) ? T["TXT-WIT-264"] : T["TXT-WIT-263"]);
        document.getElementById(`custom-${!normalized || seen.has(normalized) ? "label" : "value"}-${field.key}`)?.focus();
        return;
      }
      seen.add(normalized);
    }
    if (submit && !category) {
      setError(T["TXT-WIT-095"]);
      return;
    }
    setBusy(true);
    try {
      const saved = await save();
      if (submit && saved) onSubmitted(await client.submit(saved.id));
      else setStatus(T["TXT-WIT-190"]);
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  const corrected = (id: string) =>
    !!report.intake && id in report.fields && !sameValue(report.fields[id], report.intake.fields[id]);
  const proposed = (id: string) => !!report.intake && id in report.intake.fields;

  const hintOf = (f: PackField): string | null => {
    if (f.type === "string_list") return T["TXT-WIT-086"];
    if (f.hint) return f.hint.id;
    return proposed(f.id) ? T["TXT-WIT-226"] : null;
  };

  const evidenceHint = (e: Report["evidence"][number]): string | null =>
    e.kind === "photo" && e.metadata_removed ? T["TXT-WIT-213"] : e.kind === "screenshot" ? T["TXT-WIT-214"] : null;

  return (
    <main className="screen" data-screen="SCR-004">
      <h1>{T["TXT-WIT-080"]}</h1>
      {intakeFailed && report.domain === initial.domain ? (
        <Notice tone="info">{T["TXT-WIT-082"]}</Notice>
      ) : !report.intake ? (
        <p className="lead">{T["TXT-WIT-189"]}</p>
      ) : (
        <AiResultLabel title={T["TXT-WIT-081"]}>{T["TXT-WIT-224"]}</AiResultLabel>
      )}
      {report.region && <RegionName region={report.region} synthetic={report.synthetic} />}

      <p role="status" className={status ? "field-hint" : "visually-hidden"}>
        {status}
      </p>
      <form
        noValidate
        aria-busy={busy}
        onSubmit={(event) => {
          event.preventDefault();
          void run(true);
        }}
      >
        <fieldset className="draft-fields" disabled={busy}>
          <legend>{T["TXT-WIT-185"]}</legend>
          <p className="field-hint">{T["TXT-WIT-186"]}</p>
          <div className="field">
            <label className="field-label" htmlFor="draft-narrative">
              {T["TXT-WIT-188"]}
            </label>
            <Textarea
              id="draft-narrative"
              rows={4}
              maxLength={5000}
              value={narrative}
              onChange={(event) => setNarrative(event.target.value)}
            />
          </div>
          <div className="field">
            <label className="field-label" htmlFor="draft-category">
              {T["TXT-WIT-083"]} <span className="required">({T["TXT-WIT-085"]})</span>
            </label>
            <NativeSelect
              id="draft-category"
              className="w-full"
              value={category}
              required
              aria-describedby={report.intake?.category ? "draft-category-hint" : undefined}
              onChange={(event) => setCategory(event.target.value)}
            >
              <option value="">{T["TXT-WIT-084"]}</option>
              {pack.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label.id}
                </option>
              ))}
            </NativeSelect>
            {report.intake?.category && (
              <p className="field-hint" id="draft-category-hint">
                {T["TXT-WIT-225"]}
              </p>
            )}
          </div>

          {pack.report_fields.map((f) => {
            const hint = hintOf(f);
            const was = report.intake?.fields[f.id];
            return (
              <div className="field" key={f.id}>
                <label className="field-label" htmlFor={`field-${f.id}`}>
                  {f.label.id}
                  {f.required && <span className="required"> ({T["TXT-WIT-193"]})</span>}
                </label>
                {f.type === "enum" ? (
                  <NativeSelect
                    id={`field-${f.id}`}
                    name={f.id}
                    className="w-full"
                    value={inputs[f.id] ?? ""}
                    aria-invalid={badField === f.id}
                    onChange={(event) => setInputs((current) => ({ ...current, [f.id]: event.target.value }))}
                  >
                    <option value="">—</option>
                    {f.options?.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </NativeSelect>
                ) : (
                  <Input
                    id={`field-${f.id}`}
                    name={f.id}
                    type={INPUT_TYPE[f.type]}
                    min={f.type === "integer" ? 0 : undefined}
                    inputMode={f.type === "integer" ? "numeric" : undefined}
                    className={cn("h-12", corrected(f.id) && "border-2 border-primary")}
                    value={inputs[f.id] ?? ""}
                    aria-invalid={badField === f.id}
                    aria-describedby={hint || corrected(f.id) ? `hint-${f.id}` : undefined}
                    onChange={(event) => setInputs((current) => ({ ...current, [f.id]: event.target.value }))}
                  />
                )}
                {(hint || corrected(f.id)) && (
                  <p className="field-hint" id={`hint-${f.id}`}>
                    {corrected(f.id)
                      ? was === undefined
                        ? T["TXT-WIT-097"]
                        : t("TXT-WIT-227", { nilai: String(was) })
                      : hint}
                  </p>
                )}
              </div>
            );
          })}
        </fieldset>

        <fieldset className="draft-fields custom-fields" disabled={busy}>
          <legend>{T["TXT-WIT-254"]}</legend>
          <p className="field-hint" id="custom-fields-hint">{T["TXT-WIT-255"]}</p>
          {customFields.length === 0 && <p className="field-hint">{T["TXT-WIT-256"]}</p>}
          {customFields.map((field, index) => (
            <section className="custom-field" key={field.key} aria-labelledby={`custom-heading-${field.key}`}>
              <h3 id={`custom-heading-${field.key}`}>{t("TXT-WIT-257", { nomor: String(index + 1) })}</h3>
              <label className="field" htmlFor={`custom-label-${field.key}`}>
                <span className="field-label">{T["TXT-WIT-258"]}</span>
                <Input className="h-12" id={`custom-label-${field.key}`} type="text" maxLength={80} required
                  placeholder={T["TXT-WIT-259"]} value={field.label} aria-invalid={customError === field.key}
                  aria-describedby="custom-fields-hint"
                  onChange={(event) => setCustomFields((current) => current.map((item) => item.key === field.key ? { ...item, label: event.target.value } : item))} />
              </label>
              <label className="field" htmlFor={`custom-value-${field.key}`}>
                <span className="field-label">{T["TXT-WIT-260"]}</span>
                <Textarea id={`custom-value-${field.key}`} rows={2} maxLength={2000} required
                  placeholder={T["TXT-WIT-261"]} value={field.value} aria-invalid={customError === field.key}
                  onChange={(event) => setCustomFields((current) => current.map((item) => item.key === field.key ? { ...item, value: event.target.value } : item))} />
              </label>
              <button type="button" className={button("neutral")}
                aria-label={t("TXT-WIT-262", { nomor: String(index + 1) })}
                onClick={() => {
                  setCustomFields((current) => current.filter((item) => item.key !== field.key));
                  setCustomError(null);
                  requestAnimationFrame(() => addFieldButton.current?.focus());
                }}>{T["TXT-WIT-266"]}</button>
            </section>
          ))}
          <p className="field-hint" role="status">{customFields.length}/20 {T["TXT-WIT-267"]}</p>
          <button ref={addFieldButton} type="button" className={button("neutral")}
            disabled={customFields.length >= 20} onClick={addCustomField}>{T["TXT-WIT-265"]}</button>
        </fieldset>

        {report.missing_required.length > 0 && (
          <Notice tone="info" testId="missing-required">
            {t("TXT-WIT-099", { kolom: report.missing_required.map(label).join(", ") })}
          </Notice>
        )}

        {pack.rules.length > 0 && (
          <section aria-labelledby="rules-heading">
            <h2 id="rules-heading">{T["TXT-WIT-087"]}</h2>
            <p className="field-hint">{T["TXT-WIT-088"]}</p>
            <ul className="stack">
              {report.rule_results.map((r) => {
                const rule = pack.rules.find((x) => x.id === r.rule_id);
                const [tone, text] =
                  r.violated === null
                    ? (["info", T["TXT-WIT-091"]] as const)
                    : r.violated
                      ? (["error", T["TXT-WIT-089"]] as const)
                      : (["success", T["TXT-WIT-090"]] as const);
                return (
                  <li key={r.rule_id} data-testid={`rule-${r.rule_id}`} data-violated={String(r.violated)}>
                    <Notice tone={tone} title={text}>
                      {rule?.label.id ?? r.rule_id}
                      {r.violated && r.detail ? ` · ${r.detail}` : ""}
                    </Notice>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {(report.evidence.length > 0 || report.shared_post) && (
          <section aria-labelledby="evidence-heading">
            <h2 id="evidence-heading">{T["TXT-WIT-092"]}</h2>
            <ul className="stack">
              {report.evidence.map((e) => {
                const Icon = EVIDENCE_ICON[e.kind];
                return (
                  <li key={e.evidence_id}>
                    <AttachmentRow tile={<Icon aria-hidden="true" />} title={EVIDENCE_KIND[e.kind]} hint={evidenceHint(e)} />
                  </li>
                );
              })}
              {report.shared_post && (
                <li>
                  <AttachmentRow
                    tile={<LinkIcon aria-hidden="true" />}
                    title={T["TXT-WIT-069"]}
                    hint={<span className="mono">{report.shared_post.url}</span>}
                  />
                </li>
              )}
            </ul>
          </section>
        )}

        {report.intake?.transcript && (
          <section aria-labelledby="transcript-heading">
            <h2 id="transcript-heading">{T["TXT-WIT-252"]}</h2>
            <AiMarker className="self-start">{T["TXT-WIT-096"]}</AiMarker>
            <blockquote className="narrative">{report.intake.transcript}</blockquote>
          </section>
        )}

        <div className="actions">
          {error && <Notice tone="error">{error}</Notice>}
          <button type="submit" className={button("primary", { wide: true })} disabled={busy}>
            {T["TXT-WIT-094"]}
          </button>
          <button
            type="button"
            className={button("neutral", { wide: true })}
            disabled={busy}
            onClick={() => void run(false)}
          >
            {T["TXT-WIT-093"]}
          </button>
        </div>
      </form>
    </main>
  );
}
