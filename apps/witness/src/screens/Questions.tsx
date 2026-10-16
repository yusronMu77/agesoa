/** SCR-006 Answer audit questions: the questions Agen Audit puts to this reporter, answered in text. */

import { useState } from "react";
import type { WitnessQuestion } from "../api";
import { ApiError } from "../api";
import { Notice } from "../components";
import { T } from "../copy";

function answerError(err: unknown): string {
  if (err instanceof ApiError && err.status === 409) return T["TXT-WIT-149"];
  if (err instanceof ApiError && err.status === null) return T["TXT-WIT-130"];
  return err instanceof Error ? err.message : String(err);
}

export function Questions({
  questions,
  onAnswer,
  onBack,
}: {
  questions: WitnessQuestion[];
  /** Sends one answer; resolves when it is stored. A rejected promise is shown under the question. */
  onAnswer: (question: WitnessQuestion, answer: string) => Promise<void>;
  onBack: () => void;
}) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [sending, setSending] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

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
      <p className="field-hint">{T["TXT-WIT-141"]}</p>
      {sent && (
        <Notice tone="info" testId="answer-sent">
          {T["TXT-WIT-145"]}
        </Notice>
      )}
      {questions.length === 0 && <p data-testid="no-questions">{T["TXT-WIT-146"]}</p>}
      <ul className="plain" aria-label={T["TXT-WIT-140"]}>
        {questions.map((question) => {
          const id = question.question_id;
          const error = errors[id];
          return (
            <li key={id} className="card question" data-testid="audit-question">
              <p className="question-text">{question.text.id || question.text.en}</p>
              <div className="field">
                <label className="field-label" htmlFor={`answer-${id}`}>
                  {T["TXT-WIT-142"]}
                </label>
                <textarea
                  id={`answer-${id}`}
                  rows={3}
                  maxLength={4000}
                  value={drafts[id] ?? ""}
                  aria-invalid={error ? true : undefined}
                  onChange={(event) => setDrafts((current) => ({ ...current, [id]: event.target.value }))}
                />
                {error && (
                  <p className="field-error" role="alert">
                    {error}
                  </p>
                )}
              </div>
              <button
                type="button"
                className="button primary wide"
                disabled={sending !== null}
                onClick={() => void send(question)}
              >
                {T["TXT-WIT-143"]}
              </button>
            </li>
          );
        })}
      </ul>
      <div className="actions">
        <button type="button" className="button wide" onClick={onBack}>
          {T["TXT-WIT-068"]}
        </button>
      </div>
    </main>
  );
}
