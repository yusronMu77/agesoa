import { Check, CircleCheck, CircleDashed, Hash, TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ActorChip, ChainPill } from "@/components/public/LogBits";
import { actionLabel, count } from "@/components/public/text";
import { loadConfig } from "@/lib/config";
import { GENESIS_HASH } from "@/lib/format";
import { formatDateTime, formatNumber, type Lang, type Translate } from "@/lib/i18n/core";
import { getT } from "@/lib/i18n/server";
import type { FetchResult } from "@/lib/http";
import { type ActorCategory, actorCategory, entryChainState, entryDecision, middleHash, windowAfter } from "@/lib/publicview";
import {
  getLogEntry,
  getLogHead,
  getLogPage,
  LOG_PAGE_SIZE,
  type LogVerification,
  parseSeq,
  verifyLog,
} from "@/lib/transparency";

// SCR-042 public decision log on the ink surface: chain status of the whole log, then the entries of one window of
// LOG_PAGE_SIZE (aligned on 0, newest first), each with its actor, reason, `hash ← prev` and its own chain state.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("public.logPage.title") };
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const ACTOR_FILTERS: ActorCategory[] = ["agent", "validator", "institution", "citizen", "system"];

function parseActor(raw: string | string[] | undefined): ActorCategory | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return ACTOR_FILTERS.find((a) => a === value) ?? null;
}

function ChainBanner({
  t,
  lang,
  result,
  verifyHref,
}: {
  t: Translate;
  lang: Lang;
  result: FetchResult<LogVerification>;
  verifyHref: string;
}) {
  const checkedAt = formatDateTime(lang, new Date().toISOString());
  let tone: "ok" | "error" | "neutral";
  let title: string;
  let body: string;
  if (!result.ok) {
    tone = "neutral";
    title = t("public.logPage.unavailable");
    body = t("public.logPage.unavailableBody", { error: result.error });
  } else if (result.data.ok) {
    tone = "ok";
    title = t("public.logPage.verified", { count: count(t, "entries", result.data.length, { n: formatNumber(lang, result.data.length) }) });
    body = t("public.logPage.checked", { time: checkedAt, hash: middleHash(result.data.head_hash) });
  } else {
    tone = "error";
    title =
      result.data.first_invalid_seq !== null
        ? t("public.logPage.broken", { seq: result.data.first_invalid_seq })
        : t("public.logPage.brokenUnknown");
    body = t("public.logPage.brokenBody", { reason: result.data.reason ? `${result.data.reason}.` : "" }).trim();
  }
  const Icon = tone === "ok" ? CircleCheck : tone === "error" ? TriangleAlert : CircleDashed;
  return (
    <section className={`pub-chain-banner pub-chain-banner--${tone}`} aria-labelledby="chain-title">
      <Icon aria-hidden size={24} strokeWidth={2} />
      <div className="pub-chain-banner__text">
        <h2 id="chain-title" data-testid="chain-status">
          {title}
        </h2>
        <p>{body}</p>
      </div>
      <Link className="pub-ink-button" href={verifyHref}>
        {t("public.chain.verify")}
      </Link>
    </section>
  );
}

export default async function LogPage({ searchParams }: { searchParams: SearchParams }) {
  const { lang, t } = await getT();
  const config = loadConfig();
  const params = await searchParams;
  const actor = parseActor(params.actor);

  const [verification, head] = await Promise.all([verifyLog(config), getLogHead(config)]);
  const headSeq = head.ok ? head.data.seq : null;
  // Default: the newest window. `after` keeps the aligned windows the entry page links back to.
  const requested = parseSeq(params.after);
  const after = requested ?? (headSeq !== null ? windowAfter(headSeq, LOG_PAGE_SIZE) : 0);

  const [page, before] = await Promise.all([
    getLogPage(config, { after, limit: LOG_PAGE_SIZE }),
    after > 0 ? getLogEntry(config, after) : Promise.resolve(null),
  ]);

  const items = page.ok ? page.data.items : [];
  const prevHashOf = new Map<number, string | undefined>();
  items.forEach((item, i) => {
    prevHashOf.set(item.seq, i > 0 ? items[i - 1].hash : before?.ok ? before.data.hash : after === 0 ? GENESIS_HASH : undefined);
  });
  const newestFirst = [...items].reverse();
  const shown = actor ? newestFirst.filter((e) => actorCategory(e) === actor) : newestFirst;

  const nextAfter = page.ok ? page.data.next_after : null;
  const hasNewer = nextAfter !== null && (headSeq === null || nextAfter < headSeq);
  const olderAfter = after > 0 ? Math.max(0, after - LOG_PAGE_SIZE) : null;
  const query = (over: Record<string, string | number | null>) => {
    const q = new URLSearchParams();
    const merged = { after: requested ?? null, actor, ...over };
    for (const [k, v] of Object.entries(merged)) if (v !== null && v !== undefined) q.set(k, String(v));
    const s = q.toString();
    return s ? `/log?${s}` : "/log";
  };
  const v = verification.ok ? verification.data : null;

  return (
    <div className="pub-log log-surface">
      <header className="pub-log__head">
        <h1>{t("public.logPage.title")}</h1>
        <p className="pub-log__lead">{t("public.logPage.lead")}</p>
      </header>

      <ChainBanner t={t} lang={lang} result={verification} verifyHref={query({})} />

      {!page.ok ? (
        <section className="pub-ink-callout pub-ink-callout--error" aria-labelledby="log-error">
          <h2 id="log-error">{t("public.logPage.errorTitle")}</h2>
          <p>{t("public.logPage.errorBody", { error: page.error })}</p>
        </section>
      ) : items.length === 0 ? (
        <section className="pub-ink-callout" aria-labelledby="log-empty">
          <h2 id="log-empty">{requested ? t("public.logPage.noMore") : t("public.logPage.empty")}</h2>
          <p>
            {requested ? <Link href="/log">{t("public.logPage.backLatest")}</Link> : t("public.logPage.emptyBody")}
          </p>
        </section>
      ) : (
        <>
          <div className="pub-log__toolbar">
            <nav className="pub-chips pub-chips--ink" aria-label={t("public.logPage.actorFilter")}>
              <span className="small" aria-hidden="true">
                {t("public.logPage.actorFilter")}
              </span>
              <ul>
                {[null, ...ACTOR_FILTERS].map((a) => (
                  <li key={a ?? "all"}>
                    <Link
                      className="pub-chip-link"
                      href={query({ actor: a })}
                      aria-current={a === actor ? "true" : undefined}
                    >
                      {a === actor ? <Check aria-hidden size={14} strokeWidth={2} /> : null}
                      {a ? t(`public.actor.${a}`) : t("public.logPage.actorAll")}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
            <p className="small pub-ink-muted" id="log-caption">
              {t("public.logPage.range", {
                from: items[0].seq,
                to: items[items.length - 1].seq,
                head: headSeq ?? items[items.length - 1].seq,
              })}{" "}
              {actor ? t("public.logPage.filterNote") : null}
            </p>
          </div>

          {shown.length === 0 ? (
            <p className="pub-ink-callout">{t("public.logPage.filteredEmpty")}</p>
          ) : (
            <ol className="pub-log-list" data-testid="log-table" aria-labelledby="log-caption">
              {shown.map((item) => {
                const d = entryDecision(item);
                const state = entryChainState(item, v, prevHashOf.get(item.seq));
                const refs = Array.isArray(d.evidence_refs) ? d.evidence_refs.length : 0;
                return (
                  <li key={item.seq} className={`pub-log-entry pub-log-entry--${state}`}>
                    <div className="pub-log-entry__top">
                      <p className="pub-log-entry__meta">
                        <Link href={`/log/${item.seq}`} aria-label={t("public.logPage.entryLabel", { n: item.seq })} className="mono">
                          #{item.seq}
                        </Link>
                        <time dateTime={item.recorded_at}>{formatDateTime(lang, item.recorded_at)}</time>
                        <span className="pub-ink-muted">{item.source_service}</span>
                      </p>
                      <ActorChip t={t} category={actorCategory(item)} />
                    </div>
                    <h2 className="pub-log-entry__title">{actionLabel(t, item.action)}</h2>
                    <p className="pub-log-entry__subject pub-ink-muted small">
                      <code>{item.action}</code> · {item.subject_kind}: <code>{item.subject_id}</code>
                      {refs > 0 ? ` · ${count(t, "evidenceRefs", refs)}` : ""}
                    </p>
                    {d.reason ? <p className="pub-log-entry__reason">{t("public.logPage.reason", { reason: d.reason })}</p> : null}
                    <div className="pub-log-entry__foot">
                      <p className="pub-hashes mono">
                        <Hash aria-hidden size={16} strokeWidth={2} />
                        <span className="sr-only">{t("public.logPage.hash")}</span>
                        <code title={item.hash} className="pub-hashes__self">
                          {middleHash(item.hash)}
                        </code>
                        <span aria-hidden="true" className="pub-hashes__arrow">
                          ←
                        </span>
                        <span className="sr-only">{t("public.logPage.prevHash")}</span>
                        <code title={item.prev_hash} className="pub-ink-muted">
                          {middleHash(item.prev_hash)}
                        </code>
                      </p>
                      <ChainPill t={t} state={state} />
                    </div>
                  </li>
                );
              })}
            </ol>
          )}

          <nav className="pagination pub-pagination--ink" aria-label={t("public.logPage.pages")}>
            <ul>
              {hasNewer && nextAfter !== null ? (
                <li>
                  <Link href={query({ after: nextAfter })} rel="prev">
                    {t("public.logPage.newer", { n: LOG_PAGE_SIZE })}
                  </Link>
                </li>
              ) : null}
              {olderAfter !== null ? (
                <li>
                  <Link href={query({ after: olderAfter })} rel="next">
                    {t("public.logPage.older", { n: LOG_PAGE_SIZE })}
                  </Link>
                </li>
              ) : null}
            </ul>
          </nav>
        </>
      )}
    </div>
  );
}
