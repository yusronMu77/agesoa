/**
 * SCR-007 Share target: a post shared from another app arrives as title, text and url. The Android app receives it as
 * an `ACTION_SEND` intent through the ShareTarget plugin (android/.../ShareTargetPlugin.java); the installed PWA gets
 * the same three fields as query parameters from the manifest's `share_target`.
 */

import { Capacitor, registerPlugin } from "@capacitor/core";
import type { SharedPostInput } from "./api";
import { isPostLink } from "./fields";
import { isNative } from "./native";

/** What another app handed over; any field may be missing or empty. */
export interface ShareFields {
  title?: string | null;
  text?: string | null;
  url?: string | null;
}

const LINK = /https?:\/\/[^\s<>"']+/i;
const TRAILING = /[.,;:!?)\]}»”’]+$/;
/** The service accepts at most 1000 characters of excerpt. */
const EXCERPT_MAX = 1000;

function firstLink(...sources: (string | null | undefined)[]): string | null {
  for (const source of sources) {
    const found = LINK.exec(source ?? "")?.[0].replace(TRAILING, "");
    if (found && isPostLink(found)) return found;
  }
  return null;
}

/**
 * The post link and a short excerpt, or null when no link came with the share. Apps put the link in `url` or at the
 * end of `text` ("<caption> https://..."); the excerpt is the text without the link, else the title.
 */
export function parseShare(fields: ShareFields): SharedPostInput | null {
  const link = firstLink(fields.url, fields.text, fields.title);
  if (!link) return null;
  const clean = (value: string | null | undefined) =>
    (value ?? "")
      .split(link)
      .join(" ")
      .replace(/\s+[.,;:!?)\]}»”’]+(?=\s|$)/g, "") // punctuation that was glued to the link
      .replace(/\s+/g, " ")
      .trim();
  const excerpt = clean(fields.text) || clean(fields.title);
  return { url: link, excerpt: excerpt ? excerpt.slice(0, EXCERPT_MAX) : null };
}

/** A share as the app uses it: a post to confirm on SCR-007, or, with no link in it, text for the story field. */
export interface Received {
  post: SharedPostInput | null;
  narrative: string | null;
}

export function receive(fields: ShareFields): Received | null {
  const post = parseShare(fields);
  if (post) return { post, narrative: null };
  const text = (fields.text ?? fields.title ?? "").trim();
  return text ? { post: null, narrative: text } : null;
}

/** Query parameters of the PWA share target (`?title=&text=&url=`). */
export function fieldsFromQuery(search: string): ShareFields | null {
  const query = new URLSearchParams(search);
  if (!query.has("url") && !query.has("text") && !query.has("title")) return null;
  return { title: query.get("title"), text: query.get("text"), url: query.get("url") };
}

interface ShareTargetPlugin {
  /** The share that launched the app, once; empty when it was started another way. */
  pending(): Promise<ShareFields>;
  addListener(event: "shareReceived", listener: (fields: ShareFields) => void): Promise<{ remove: () => Promise<void> }>;
}

const ShareTarget = registerPlugin<ShareTargetPlugin>("ShareTarget");

/** The share that opened the app, or null. A PWA share is taken out of the address so a reload does not repeat it. */
export async function initialShare(): Promise<Received | null> {
  if (isNative()) {
    if (!Capacitor.isPluginAvailable("ShareTarget")) return null;
    return receive(await ShareTarget.pending().catch(() => ({})));
  }
  if (typeof location === "undefined") return null;
  const fields = fieldsFromQuery(location.search);
  if (!fields) return null;
  history.replaceState(null, "", location.pathname + location.hash);
  return receive(fields);
}

/** Calls `listener` for each share that reaches the already running app (Android only); returns the unsubscribe. */
export function onShare(listener: (received: Received | null) => void): () => void {
  if (!isNative() || !Capacitor.isPluginAvailable("ShareTarget")) return () => undefined;
  const handle = ShareTarget.addListener("shareReceived", (fields) => listener(receive(fields)));
  return () => void handle.then((h) => h.remove());
}
