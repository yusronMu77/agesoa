/**
 * SCR-006 Answer audit questions: the status of the reporter's last report and the questions Agen Audit puts to this
 * reporter, answered in text or by voice (dictation into the text field; only text is sent).
 */

import { useEffect, useRef, useState } from "react";
import type { Report, WitnessQuestion } from "../api";
import { ApiError } from "../api";
import { AiTag, EmptyState, EvidenceBadge, Notice } from "../components";
import { pick, t, T } from "../copy";
import { Icon } from "../icons";
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
          <EvidenceBadge level="alleged" />
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
  const [sent, setSent] = useState(false);
  const [listening, setListening] = useState<string | null>(null);
  const dictation = useRef<Dictation | null>(null);
  const canDictate = dictationSupported();
  useEffect(() => () => dictation.current?.stop(), []);

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

  const setError = (id: string, text: string) => setErrors((current) => ({ ...current, [id]: text }));

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
      setSent(true);
    } catch (err) {
      setError(id, answerError(err));
    } finally {
      setSending(null);
    }
  };

  return (
    <main className="screen" data-screen="SCR-006">
      <h1>{T["TXT-WIT-140"]}</h1>
      {sent && (
        <p className="toast" role="status" data-testid="answer-sent">
          <Icon name="checkCircle" size={20} />
          {T["TXT-WIT-145"]}
        </p>
      )}
      <Notice tone="info" title={T["TXT-WIT-220"]}>
        {T["TXT-WIT-221"]}
      </Notice>
      {report && <ReportStatus report={report} />}
      {questions.length === 0 ? (
        <EmptyState title={T["TXT-WIT-146"]} testId="no-questions">
          {T["TXT-WIT-225"]}
        </EmptyState>
      ) : (
        <ul className="questions" aria-label={T["TXT-WIT-140"]}>
          {questions.map((question, index) => {
            const id = question.question_id;
            const error = errors[id];
            return (
              <li key={id} className="question" data-testid="audit-question">
                <div className="card question-card">
                  <div className="question-meta">
                    <span>{t("TXT-WIT-222", { n: index + 1, total: questions.length })}</span>
                    <AiTag>{T["TXT-WIT-223"]}</AiTag>
                  </div>
                  <p className="question-text">{pick(question.text)}</p>
                </div>
                <div className="field">
                  <label className="field-label" htmlFor={`answer-${id}`}>
                    {T["TXT-WIT-142"]}
                  </label>
                  <textarea
                    id={`answer-${id}`}
                    rows={4}
                    maxLength={4000}
                    placeholder={T["TXT-WIT-224"]}
                    value={drafts[id] ?? ""}
                    aria-invalid={error ? true : undefined}
                    aria-describedby={`answer-${id}-hint`}
                    onChange={(event) => setDrafts((current) => ({ ...current, [id]: event.target.value }))}
                  />
                  {error ? (
                    <p className="field-error" id={`answer-${id}-hint`} role="alert">
                      <Icon name="alert" size={16} />
                      {error}
                    </p>
                  ) : (
                    <p className="field-hint" id={`answer-${id}-hint`}>
                      {T["TXT-WIT-226"]}
                    </p>
                  )}
                </div>
                {canDictate && (
                  <div className="field">
                    <button
                      type="button"
                      className="button start"
                      aria-pressed={listening === id}
                      data-testid="dictate-answer"
                      onClick={() => toggleDictation(id)}
                    >
                      <Icon name={listening === id ? "stop" : "mic"} />
                      {listening === id ? T["TXT-WIT-174"] : T["TXT-WIT-173"]}
                    </button>
                    <p className="field-hint">{T["TXT-WIT-175"]}</p>
                  </div>
                )}
                <button
                  type="button"
                  className="button primary lg wide"
                  disabled={sending !== null}
                  onClick={() => void send(question)}
                >
                  {T["TXT-WIT-143"]}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
