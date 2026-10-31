import { ChevronRight, CircleCheck, Info, MapPin } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { EvidenceBadge } from "@/components/EvidenceBadge";
import { AskForm } from "@/components/public/AskForm";
import { loadConfig } from "@/lib/config";
import { getT } from "@/lib/i18n/server";
import { askQuestion, parseQuestion } from "@/lib/questions";
import { shortDistrictName } from "@/lib/publicview";
import { ROUTES } from "@/lib/routes";

// Public question about the findings (#74): the answer of Agen Report (transparency) from validated findings only,
// with the findings it used as references to their case pages. Nothing is stored; the URL is the question.
export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("public.ask.title") };
}

export default async function AskPage({ searchParams }: { searchParams: SearchParams }) {
  const { lang, t } = await getT();
  const raw = (await searchParams).q;
  const question = parseQuestion(raw);
  const result = question ? await askQuestion(loadConfig(), question, lang) : null;

  return (
    <div className="pub-ask-page">
      <p className="eyebrow">{t("public.dashboard.title")}</p>
      <h1>{t("public.ask.title")}</h1>

      <AskForm t={t} question={question ?? (typeof raw === "string" ? raw : "")} id="ask-page" />

      {raw !== undefined && !question ? (
        <p className="callout callout--warning" role="alert" data-testid="ask-invalid">
          {t("public.ask.invalid")}
        </p>
      ) : null}

      {result && !result.ok ? (
        <p className="callout callout--warning" role="alert" data-testid="ask-unavailable">
          {t("public.ask.unavailable")}
        </p>
      ) : null}

      {result?.ok ? (
        <section className="card ask-answer" aria-labelledby="answer-heading" data-testid="ask-answer">
          <h2 id="answer-heading">{t("public.ask.answer")}</h2>
          <p className="ask-answer__text" lang={lang} data-testid="answer-text">
            {result.data.answer}
          </p>
          <p className="pub-howto ask-answer__note">
            <Info aria-hidden size={16} strokeWidth={2} />
            <span>{t("public.ask.note")}</span>
          </p>

          <h3>{t("public.ask.references")}</h3>
          {result.data.references.length === 0 ? (
            <p className="pub-empty" data-testid="answer-no-references">
              {t("public.ask.noReferences")}
            </p>
          ) : (
            <ol className="finding-list ask-refs" data-testid="answer-references">
              {result.data.references.map((r) => (
                <li key={r.finding_id} className="pub-finding" data-testid="answer-reference" data-finding-id={r.finding_id}>
                  <div className="pub-finding__top">
                    <EvidenceBadge status={r.status} lang={lang} />
                    <span className="badge badge--ok">
                      <CircleCheck aria-hidden size={14} strokeWidth={2} />
                      {t(r.approvals === 1 ? "public.ask.validated.one" : "public.ask.validated.other", { n: r.approvals })}
                    </span>
                    {r.synthetic ? <span className="badge badge--neutral">{t("public.ask.synthetic")}</span> : null}
                  </div>
                  <p className="pub-finding__statement">{r.statement}</p>
                  <div className="pub-finding__foot">
                    {r.region_name ? (
                      <span className="pub-place">
                        <MapPin aria-hidden size={14} strokeWidth={2} />
                        <span>{shortDistrictName(r.region_name)}</span>
                      </span>
                    ) : (
                      <span />
                    )}
                    {r.case_id ? (
                      <Link href={ROUTES.case(r.case_id)} className="pub-more">
                        {t("public.ask.openCase", { id: r.case_id })}
                        <ChevronRight aria-hidden size={16} strokeWidth={2} />
                      </Link>
                    ) : null}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>
      ) : null}
    </div>
  );
}
