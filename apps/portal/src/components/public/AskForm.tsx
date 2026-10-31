import { Search } from "lucide-react";
import type { Translate } from "@/lib/i18n/core";
import { QUESTION_MAX, QUESTION_MIN } from "@/lib/questions";
import { ROUTES } from "@/lib/routes";

/**
 * "Ask about the findings" form: a plain GET to `/ask?q=`, so it works without client JavaScript and an answer page
 * can be shared as a link. Shown on the dashboard (SCR-040, above the evidence status filter) and above the answer.
 * The hint under the label says what an answer is made from.
 */
export function AskForm({ t, question = "", id = "ask" }: { t: Translate; question?: string; id?: string }) {
  return (
    <form action={ROUTES.ask} method="get" className="form ask-form" role="search" data-testid="ask-form">
      <label htmlFor={`${id}-q`}>{t("public.ask.label")}</label>
      <p id={`${id}-hint`} className="ask-form__hint">
        {t("public.ask.sub")}
      </p>
      <div className="ask-form__row">
        <input
          id={`${id}-q`}
          aria-describedby={`${id}-hint`}
          type="text"
          name="q"
          required
          minLength={QUESTION_MIN}
          maxLength={QUESTION_MAX}
          defaultValue={question}
          placeholder={t("public.ask.placeholder")}
          autoComplete="off"
        />
        <button type="submit" className="button">
          <Search aria-hidden size={16} strokeWidth={2} />
          {t("public.ask.submit")}
        </button>
      </div>
    </form>
  );
}
