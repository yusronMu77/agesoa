import { EvidenceBadge } from "@agesoa/ui/components/evidence-badge";
import { AiMarker } from "@agesoa/ui/components/ai-marker";
import { Textarea } from "@agesoa/ui/components/textarea";
import { MicIcon } from "lucide-react";
import { button } from "../ui";
/**
 * SCR-006 Answer audit questions: the status of the last report of this device and the question Agen Audit puts
 * to the reporter, answered in text or by voice (dictation into the text field; only text is sent). One question
 * at a time.
 */

import { useEffect, useRef, useState } from "react";
import type { Report, WitnessQuestion } from "../api";
import { ApiError } from "../api";
import { Notice } from "../components";
import { T, t } from "../copy";
import type { Dictation } from "../dictation";
import { appendDictated, dictationSupported, startDictation } from "../dictation";
import { formatWib } from "../fields";
import { reportCode } from "./Submitted";

function answerError(err: unknown): string {
  if (err instanceof ApiError && err.status === 409) return T["TXT-WIT-149"];
  if (err instanceof ApiError && err.status === null) return T["TXT-WIT-130"];
  return err instanceof Error ? err.message : String(err);
}

function ReportStatus({ report }: { report: Report }) {
  const deadline = report.evidence_status;
  return (
    <section className="card" aria-labelledby="report-status-heading" data-testid="report-status">
      <h2 id="report-status-heading">{T["TXT-WIT-170"]}</h2>
      <dl className="facts">
        <dt>{T["TXT-WIT-171"]}</dt>
        <dd className="mono" data-testid="report-status-code">
          {reportCode(report)}
        </dd>
        {report.submitted_at && (
          <>
            <dt>{T["TXT-WIT-172"]}</dt>
            <dd>{formatWib(report.submitted_at)}</dd>
          </>
        )}
        <dt>{T["TXT-WIT-116"]}</dt>
        <dd>
          <EvidenceBadge status="alleged">{T["TXT-EVD-001"]}</EvidenceBadge>
        </dd>
      </dl>
      {deadline?.status === "likely_lost" && <p className="field-hint">{T["TXT-WIT-115"]}</p>}
    </section>
  );
}

export function Questions({
  questions,
  report,
  onAnswer,
}: {
  questions: WitnessQuestion[];
  /** The last report this device submitted, when known. */
  report?: Report | null;
  /** Sends one answer; resolves when it is stored. A rejected promise is shown under the question. */
  onAnswer: (question: WitnessQuestion, answer: string) => Promise<void>;
}) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [sending, setSending] = useState<string | null>(null);
  const [answered, setAnswered] = useState(0);
  const [listening, setListening] = useState<string | null>(null);
  const dictation = useRef<Dictation | null>(null);
  const canDictate = dictationSupported();
  useEffect(() => () => dictation.current?.stop(), []);

  const setError = (id: string, text: string) => setErrors((current) => ({ ...current, [id]: text }));

  const toggleDictation = (id: string) => {
    if (listening === id) {
      dictation.current?.stop();
      return;
    }
    dictation.current?.stop();
    setError(id, "");
    dictation.current = startDictation(
      (phrase) => setDrafts((current) => ({ ...current, [id]: appendDictated(current[id] ?? "", phrase) })),
      (failure) => {
        setListening(null);
        dictation.current = null;
        if (failure && failure !== "aborted" && failure !== "no-speech") setError(id, T["TXT-WIT-176"]);
      },
    );
    setListening(dictation.current ? id : null);
  };

  const send = async (question: WitnessQuestion) => {
    const id = question.question_id;
    const answer = (drafts[id] ?? "").trim();
    if (!answer) {
      setError(id, T["TXT-WIT-144"]);
      return;
    }
    setSending(id);
    setError(id, "");
    try {
      await onAnswer(question, answer);
      setAnswered((n) => n + 1);
    } catch (err) {
      setError(id, answerError(err));
    } finally {
      setSending(null);
    }
  };

  const question = questions[0];
  const total = answered + questions.length;
  const id = question?.question_id ?? "";
  return (
    <main className="screen" data-screen="SCR-006">
      <h1>{T["TXT-WIT-140"]}</h1>
      <Notice tone="info" title={T["TXT-WIT-229"]}>
        {T["TXT-WIT-141"]}
      </Notice>
      {report && <ReportStatus report={report} />}
      {answered > 0 && (
        <Notice tone="success" testId="answer-sent">
          {T["TXT-WIT-145"]}
        </Notice>
      )}
      {!question && <p data-testid="no-questions">{T["TXT-WIT-146"]}</p>}
      {question && (
        <>
          <section className="card question" data-testid="audit-question" aria-label={T["TXT-WIT-140"]}>
            <div className="question-head">
              <span>{t("TXT-WIT-230", { nomor: answered + 1, jumlah: total, kasus: question.case_id.slice(0, 8) })}</span>
              <AiMarker>{T["TXT-WIT-231"]}</AiMarker>
            </div>
            <p className="question-text">{question.text.id || question.text.en}</p>
            <p className="field-hint">{T["TXT-WIT-232"]}</p>
          </section>
          <div className="field">
            <label className="field-label" htmlFor={`answer-${id}`}>
              {T["TXT-WIT-142"]}
            </label>
            <Textarea
              id={`answer-${id}`}
              rows={5}
              maxLength={4000}
              placeholder={T["TXT-WIT-251"]}
              aria-describedby={`answer-hint-${id}`}
              aria-invalid={errors[id] ? true : undefined}
              value={drafts[id] ?? ""}
              onChange={(event) => setDrafts((current) => ({ ...current, [id]: event.target.value }))}
            />
            <p className="field-hint" id={`answer-hint-${id}`}>
              {T["TXT-WIT-233"]}
            </p>
            {errors[id] && (
              <p className="field-error" role="alert">
                {errors[id]}
              </p>
            )}
          </div>
          {canDictate && (
            <div className="field">
              <button
                type="button"
                className={button("neutral", { wide: true })}
                aria-pressed={listening === id}
                data-testid="dictate-answer"
                onClick={() => toggleDictation(id)}
              >
                <MicIcon aria-hidden="true" data-icon="inline-start" />
                {listening === id ? T["TXT-WIT-174"] : T["TXT-WIT-173"]}
              </button>
              <p className="field-hint">{T["TXT-WIT-175"]}</p>
            </div>
          )}
          <div className="actions">
            <button
              type="button"
              className={button("primary", { wide: true })}
              disabled={sending !== null}
              onClick={() => void send(question)}
            >
              {T["TXT-WIT-143"]}
            </button>
          </div>
        </>
      )}
    </main>
  );
}
