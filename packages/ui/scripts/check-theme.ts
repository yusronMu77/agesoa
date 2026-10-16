#!/usr/bin/env bun
/**
 * Checks that theme.css carries exactly the shadcn theme of penpot-theme.css (generated in agesoa-uiux from the
 * same tokens.json as tokens.css) and that both files come from the same token version as tokens.css.
 *
 * Usage (from packages/ui): bun scripts/check-theme.ts      exit 1 on any difference
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const dir = resolve(import.meta.dir, "..");
const read = (name: string) => readFileSync(resolve(dir, name), "utf8");

/** Every `--name: value;` declaration inside the first block that starts with `head`. */
function declarations(css: string, head: string): Map<string, string> {
  const start = css.indexOf(head);
  if (start < 0) return new Map();
  const open = css.indexOf("{", start);
  const close = css.indexOf("}", open);
  const found = css.slice(open + 1, close).matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g);
  return new Map([...found].map((m) => [m[1], m[2].trim()]));
}

const version = (css: string) => /version ([\w.]+)/.exec(css)?.[1];

const theme = read("theme.css");
const source = read("penpot-theme.css");
const problems: string[] = [];

for (const head of [":root", "@theme inline"]) {
  const want = declarations(source, head);
  // theme.css holds the colour mappings in a hand-written @theme block, so search the generated one by value.
  const have = new Map<string, string>();
  for (const m of theme.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) have.set(m[1], m[2].trim());
  if (want.size === 0) problems.push(`penpot-theme.css has no ${head} block`);
  for (const [name, value] of want) {
    if (have.get(name) !== value) problems.push(`${name}: theme.css has ${have.get(name) ?? "nothing"}, penpot-theme.css has ${value}`);
  }
}

const tokensVersion = version(read("tokens.css"));
if (version(source) !== tokensVersion) problems.push(`penpot-theme.css is tokens ${version(source)}, tokens.css is ${tokensVersion}`);

if (problems.length > 0) {
  console.error(`theme.css is out of date:\n- ${problems.join("\n- ")}`);
  process.exit(1);
}
console.log(`theme.css matches penpot-theme.css (tokens ${tokensVersion})`);
