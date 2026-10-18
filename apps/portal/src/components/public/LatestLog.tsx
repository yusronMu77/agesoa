import Link from "next/link";
import { formatDateTime, type Lang, type Translate } from "@/lib/i18n/core";
import { actorCategory, middleHash } from "@/lib/publicview";
import type { LogEntry } from "@/lib/transparency";
import { actionLabel, actorLabel } from "./text";

/** SCR-040 side panel "Log terbaru": the latest entries of the public decision log on the ink surface, newest first. */
export function LatestLog({ t, lang, entries }: { t: Translate; lang: Lang; entries: LogEntry[] | null }) {
  return (
    <aside className="pub-ink-panel" aria-labelledby="latest-log-heading">
      <div className="pub-section-head">
        <h2 id="latest-log-heading">{t("public.log.title")}</h2>
        <Link href="/log" className="pub-ink-panel__all">
          {t("public.log.seeAll")}
        </Link>
      </div>
      {entries === null ? (
        <p className="pub-ink-muted">{t("public.log.unavailable")}</p>
      ) : entries.length === 0 ? (
        <p className="pub-ink-muted">{t("public.log.empty")}</p>
      ) : (
        <ol className="pub-mini-log">
          {entries.map((e) => (
            <li key={e.seq}>
              <Link href={`/log/${e.seq}`} className="pub-mini-log__link">
                <span className="pub-mini-log__meta">
                  <span className="mono pub-mini-log__seq">#{e.seq}</span>
                  <time dateTime={e.recorded_at}>{formatDateTime(lang, e.recorded_at)}</time>
                  <span aria-hidden="true">·</span>
                  <span>{actorLabel(t, actorCategory(e))}</span>
                </span>
                <span className="pub-mini-log__title">{actionLabel(t, e.action)}</span>
                <code className="pub-mini-log__hash" title={e.hash}>
                  {middleHash(e.hash)}
                </code>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </aside>
  );
}
