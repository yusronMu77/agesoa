/**
 * SCR-006 Answer audit questions: the questions Agen Audit puts to this reporter, one at a time, answered in text or by
 * voice (dictation into the text field; only text is sent). The region of the reporter's last report gives context.
 */

import { useEffect, useRef, useState } from "react";
import type { Report, WitnessQuestion } from "../api";
import { ApiError } from "../api";
import { AiTag, EmptyState, Notice } from "../components";
import { pick, t, T } from "../copy";
import { Icon } from "../icons";
import type { Dictation } from "../dictation";
import { appendDictated, dictationSupported, startDictation } from "../dictation";

function answerError(err: unknown): string {
  if (err instanceof ApiError && err.status === 409) return T["TXT-WIT-149"];
  if (err instanceof ApiError && err.status === null) return T["TXT-WIT-130"];
  return err instanceof Error ? err.message : String(err);
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
  const [dictated, setDictated] = useState(false);
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
    if (dictation.current) setDictated(true);
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

  // One question at a time (SCR-006): the next one appears once this one is answered.
  const question = questions[0];
  const id = question?.question_id;
  const error = id ? errors[id] : undefined;
  const region = report?.region?.district_name ?? report?.region?.regency_name;

  return (
    <main className="screen" data-screen="SCR-006">
      <h1>{T["TXT-WIT-140"]}</h1>
      {sent && (
        <p className="toast" role="status" data-testid="answer-sent">
          <Icon name="checkCircle" size={20} />
          {T["TXT-WIT-145"]}
        </p>
      )}
      <Notice tone="info" title={T["TXT-WIT-420"]}>
        {T["TXT-WIT-421"]}
      </Notice>
      {!question || !id ? (
        <EmptyState title={T["TXT-WIT-146"]} testId="no-questions">
          {T["TXT-WIT-425"]}
        </EmptyState>
      ) : (
        <div className="question" data-testid="audit-question" key={id}>
          <section className="card question-card" aria-labelledby={`question-${id}`}>
            <div className="question-meta">
              <span>
                {t("TXT-WIT-422", { n: 1, total: questions.length })} ·{" "}
                <span className="nowrap">{t("TXT-WIT-432", { id: question.case_id })}</span>
              </span>
              <AiTag>{T["TXT-WIT-423"]}</AiTag>
            </div>
            <h2 className="question-text" id={`question-${id}`}>
              {pick(question.text)}
            </h2>
            <p className="question-context">
              {region ? t("TXT-WIT-304", { wilayah: region }) : T["TXT-WIT-305"]}
            </p>
          </section>
          <div className="field">
            <label className="field-label" htmlFor={`answer-${id}`}>
              {T["TXT-WIT-142"]}
            </label>
            <textarea
              id={`answer-${id}`}
              rows={4}
              maxLength={4000}
              placeholder={T["TXT-WIT-424"]}
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
                {T["TXT-WIT-426"]}
              </p>
            )}
          </div>
          {canDictate && (
            <div className="field">
              <button
                type="button"
                className="button tile"
                aria-pressed={listening === id}
                aria-describedby={`dictate-${id}-note`}
                data-testid="dictate-answer"
                onClick={() => toggleDictation(id)}
              >
                <Icon name={listening === id ? "stop" : "mic"} />
                {listening === id ? T["TXT-WIT-174"] : T["TXT-WIT-018"]}
              </button>
              {/* Shown once dictation is used; always the description of the button for screen readers. */}
              <p
                className={dictated ? "field-hint" : "field-hint visually-hidden"}
                id={`dictate-${id}-note`}
              >
                {T["TXT-WIT-175"]}
              </p>
            </div>
          )}
          <div className="actions">
            <button
              type="button"
              className="button primary wide"
              disabled={sending !== null}
              onClick={() => void send(question)}
            >
              {T["TXT-WIT-143"]}
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
