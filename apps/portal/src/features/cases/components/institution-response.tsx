import { Badge } from "@/components/ui/badge";
import { formatTime } from "@/lib/format";
import { safeLink } from "@/lib/safe-link";
import type { PublicFollowUp, PublicReply } from "@/services/read-model/read-model.model";
import { FOLLOW_UP_STATUS_LABEL, FOLLOW_UP_TONE } from "../constants";

/** SCR-043: latest follow-up status per institution. */
export function FollowUpList({ followUps }: { followUps: PublicFollowUp[] | undefined }) {
  return (
    <section aria-labelledby="case-follow-up">
      <h2 id="case-follow-up">Institution follow-up</h2>
      {followUps?.length ? (
        <ul className="finding-list">
          {followUps.map((f) => (
            <li key={f.organization_id} className="card" data-testid="follow-up" data-status={f.status}>
              <div className="finding-head">
                <Badge tone={FOLLOW_UP_TONE[f.status] ?? "neutral"}>{FOLLOW_UP_STATUS_LABEL[f.status] ?? f.status}</Badge>
                <span className="muted">
                  <code>{f.organization_id}</code> · updated <time dateTime={f.updated_at}>{formatTime(f.updated_at)}</time>
                </span>
              </div>
              {f.note ? <p className="finding-statement">{f.note}</p> : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted" data-testid="follow-up-empty">
          No follow-up yet.
        </p>
      )}
    </section>
  );
}

/** SCR-043: right of reply, the institution's own words, with its http(s) attachments only. */
export function ReplyList({ replies }: { replies: PublicReply[] | undefined }) {
  if (!replies?.length) return null;
  return (
    <section aria-labelledby="case-replies">
      <h2 id="case-replies">Right of reply</h2>
      <ul className="finding-list">
        {replies.map((r) => {
          const attachments = (r.attachments ?? [])
            .map((a) => ({ name: a.name, href: safeLink(a.url) }))
            .filter((a): a is { name: string; href: string } => a.href !== null);
          return (
            <li key={r.reply_id} className="card right-of-reply" data-testid="right-of-reply">
              <p className="right-of-reply__label">
                Right of reply from the institution — the institution&apos;s own statement, not verified by AGESOA
              </p>
              <p className="muted">
                <code>{r.organization_id}</code> · received <time dateTime={r.received_at}>{formatTime(r.received_at)}</time>
              </p>
              <p className="right-of-reply__body">{r.body}</p>
              {attachments.length ? (
                <ul>
                  {attachments.map((a, i) => (
                    <li key={`${i}-${a.href}`}>
                      <a href={a.href} rel="noopener noreferrer nofollow" target="_blank">
                        {a.name || a.href}
                      </a>
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
