import { CircleCheck, CircleDashed, TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActorChip } from "@/components/public/LogBits";
import { actionLabel } from "@/components/public/text";
import { loadConfig } from "@/lib/config";
import { GENESIS_HASH } from "@/lib/format";
import { formatDateTime } from "@/lib/i18n/core";
import { getT } from "@/lib/i18n/server";
import { actorCategory, entryDecision, windowAfter } from "@/lib/publicview";
import { getLogEntry, getLogHead, LOG_PAGE_SIZE, parseSeq } from "@/lib/transparency";

// SCR-042 one decision of the public log: who decided and why, the hash and the link to the entry before it, and
// the entry exactly as it was hashed.
export const dynamic = "force-dynamic";

type Params = Promise<{ seq: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { t } = await getT();
  const seq = parseSeq((await params).seq);
  return { title: seq ? t("public.entry.title", { seq }) : t("public.logPage.title") };
}

export default async function LogEntryPage({ params }: { params: Params }) {
  const seq = parseSeq((await params).seq);
  if (seq === undefined || seq < 1) notFound();

  const { lang, t } = await getT();
  const config = loadConfig();
  const [entry, previous, head] = await Promise.all([
    getLogEntry(config, seq),
    seq > 1 ? getLogEntry(config, seq - 1) : Promise.resolve(null),
    getLogHead(config),
  ]);

  if (!entry.ok && entry.status === 404) notFound();

  if (!entry.ok) {
    return (
      <div className="pub-log log-surface">
        <h1>{t("public.entry.title", { seq })}</h1>
        <section className="pub-ink-callout pub-ink-callout--error" aria-labelledby="entry-error">
          <h2 id="entry-error">{t("public.entry.errorTitle")}</h2>
          <p>{t("public.entry.errorBody", { error: entry.error })}</p>
          <p>
            <Link href="/log">{t("public.entry.toLog")}</Link>
          </p>
        </section>
      </div>
    );
  }

  const item = entry.data;
  const d = entryDecision(item);
  const isGenesis = item.seq === 1 && item.prev_hash === GENESIS_HASH;
  const linkMatches = previous?.ok ? previous.data.hash === item.prev_hash : null;
  const headSeq = head.ok ? head.data.seq : null;
  const pageAfter = windowAfter(item.seq, LOG_PAGE_SIZE);
  const tone = isGenesis || linkMatches === true ? "intact" : linkMatches === false ? "mismatch" : "unchecked";
  const Icon = tone === "intact" ? CircleCheck : tone === "mismatch" ? TriangleAlert : CircleDashed;

  return (
    <div className="pub-log log-surface">
      <header className="pub-log__head">
        <p>
          <Link href={pageAfter > 0 ? `/log?after=${pageAfter}` : "/log"}>{t("public.entry.back")}</Link>
        </p>
        <div className="pub-entry__title">
          <h1>{t("public.entry.title", { seq: item.seq })}</h1>
          <ActorChip t={t} category={actorCategory(item)} />
        </div>
        <p className="pub-log__lead">{actionLabel(t, item.action)}</p>
      </header>

      <p className={`pub-chain pub-chain--${tone} pub-entry__link`} data-testid="link-status">
        <Icon aria-hidden size={16} strokeWidth={2} />
        {isGenesis
          ? t("public.entry.genesis")
          : linkMatches === true
            ? t("public.entry.linked", { n: item.seq - 1 })
            : linkMatches === false
              ? t("public.entry.mismatch", { n: item.seq - 1 })
              : t("public.entry.unchecked")}
      </p>

      <div className="pub-ink-card">
        <dl className="fields pub-fields--ink">
          <dt>{t("public.entry.recorded")}</dt>
          <dd>
            <time dateTime={item.recorded_at}>{formatDateTime(lang, item.recorded_at)}</time>
          </dd>
          {d.actor?.name ? (
            <>
              <dt>{t("public.entry.actor")}</dt>
              <dd>{d.actor.name}</dd>
            </>
          ) : null}
          {d.reason ? (
            <>
              <dt>{t("public.entry.reason")}</dt>
              <dd>{d.reason}</dd>
            </>
          ) : null}
          <dt>{t("public.entry.source")}</dt>
          <dd>{item.source_service}</dd>
          <dt>{t("public.entry.action")}</dt>
          <dd>
            <code>{item.action}</code>
          </dd>
          <dt>{t("public.entry.subject")}</dt>
          <dd>
            {item.subject_kind}: <code>{item.subject_id}</code>
          </dd>
          <dt>{t("public.entry.decisionId")}</dt>
          <dd>
            <code>{item.decision_id}</code>
          </dd>
          <dt>{t("public.entry.eventId")}</dt>
          <dd>
            <code>{item.event_id}</code>
          </dd>
          <dt>{t("public.entry.hash")}</dt>
          <dd>
            <code data-testid="entry-hash">{item.hash}</code>
          </dd>
          <dt>{t("public.entry.prevHash")}</dt>
          <dd>
            {item.seq > 1 ? (
              <Link href={`/log/${item.seq - 1}`} aria-label={t("public.entry.prevAria", { n: item.seq - 1 })}>
                <code>{item.prev_hash}</code>
              </Link>
            ) : (
              <code>{item.prev_hash}</code>
            )}
          </dd>
        </dl>
      </div>

      <section aria-labelledby="entry-json" className="pub-block">
        <h2 id="entry-json">{t("public.entry.json")}</h2>
        <pre className="json pub-json" tabIndex={0} aria-label={t("public.entry.jsonLabel")}>
          <code>{JSON.stringify(item.entry, null, 2)}</code>
        </pre>
      </section>

      <nav className="pagination pub-pagination--ink" aria-label={t("public.entry.neighbours")}>
        <ul>
          {item.seq > 1 ? (
            <li>
              <Link href={`/log/${item.seq - 1}`} rel="prev">
                {t("public.entry.prev", { n: item.seq - 1 })}
              </Link>
            </li>
          ) : null}
          {headSeq !== null && item.seq < headSeq ? (
            <li>
              <Link href={`/log/${item.seq + 1}`} rel="next">
                {t("public.entry.next", { n: item.seq + 1 })}
              </Link>
            </li>
          ) : null}
        </ul>
      </nav>
    </div>
  );
}
