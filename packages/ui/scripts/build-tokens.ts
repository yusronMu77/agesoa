#!/usr/bin/env bun
/**
 * Generates packages/ui/tokens.css (CSS custom properties) from the design-token
 * source (W3C Design Tokens Community Group format) kept in the design repository.
 *
 * Usage (from packages/ui):
 *   bun scripts/build-tokens.ts [path/to/tokens.json] [--out tokens.css] [--check]
 *
 * The default source path is ../../../agesoa-uiux/design-system/tokens.json,
 * resolved against packages/ui (the design repository checked out as a sibling of
 * this repository). --check exits 1 when tokens.css is out of date instead of
 * writing it.
 *
 * Naming: every token becomes --ag-<path joined with "-">. Tokens under the
 * "semantic" group drop that prefix (semantic.color.text.primary becomes
 * --ag-color-text-primary) and reference their base token with var(). A token's
 * "agesoa.stroke" extension becomes an extra "<name>-stroke" variable. Tokens named
 * in Indonesian get an English alias (see ENGLISH_ALIASES). A token may carry a
 * dark-mode value in the "agesoa.dark" extension; those are emitted under
 * prefers-color-scheme: dark.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve, sep } from "node:path";

const PREFIX = "ag";
const PACKAGE_DIR = resolve(import.meta.dir, "..");
const DEFAULT_SOURCE = "../../../agesoa-uiux/design-system/tokens.json";

/** English aliases for token paths that use Indonesian domain terms. */
const ENGLISH_ALIASES: Record<string, string> = {
  "color.evidence.dugaan": "color.evidence.alleged",
  "color.evidence.didukung-bukti": "color.evidence.supported",
  "color.evidence.terbukti": "color.evidence.proven",
  "color.simulasi.band": "color.simulation.band",
  "color.simulasi.on-band": "color.simulation.on-band",
};

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type TokenNode = { [key: string]: Json };

interface Token {
  path: string[];
  type: string | undefined;
  value: Json;
  description?: string;
  extensions?: TokenNode;
}

interface Variable {
  name: string;
  value: string;
  comment?: string;
}

function parseArgs(argv: string[]) {
  let source = DEFAULT_SOURCE;
  let out = "tokens.css";
  let check = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--out") out = argv[++i] ?? out;
    else if (arg === "--check") check = true;
    else if (arg === "--") continue;
    else if (arg.startsWith("--")) throw new Error(`Unknown option ${arg}`);
    else source = arg;
  }
  return { source: resolve(PACKAGE_DIR, source), out: resolve(PACKAGE_DIR, out), check };
}

function isObject(value: Json | undefined): value is TokenNode {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function collectTokens(node: TokenNode, path: string[], inheritedType: string | undefined, out: Token[]) {
  const groupType = typeof node.$type === "string" ? node.$type : inheritedType;
  if ("$value" in node) {
    out.push({
      path,
      type: groupType,
      value: node.$value,
      description: typeof node.$description === "string" ? node.$description : undefined,
      extensions: isObject(node.$extensions) ? node.$extensions : undefined,
    });
    return;
  }
  for (const [key, child] of Object.entries(node)) {
    if (key.startsWith("$") || !isObject(child)) continue;
    collectTokens(child, [...path, key], groupType, out);
  }
}

function cssName(path: string[]): string {
  const parts = path[0] === "semantic" ? path.slice(1) : path;
  return `--${PREFIX}-${parts.join("-")}`;
}

function dimension(value: Json): string {
  if (isObject(value) && typeof value.value === "number" && typeof value.unit === "string") {
    return `${value.value}${value.unit}`;
  }
  if (typeof value === "number") return `${value}px`;
  if (typeof value === "string") return value;
  throw new Error(`Unsupported dimension ${JSON.stringify(value)}`);
}

function fontFamily(value: Json): string {
  const families = Array.isArray(value) ? value : [value];
  const generic = new Set(["serif", "sans-serif", "monospace", "cursive", "fantasy", "system-ui", "ui-monospace", "ui-sans-serif", "ui-serif"]);
  return families
    .map((family) => String(family))
    .map((family) => (generic.has(family) ? family : `"${family}"`))
    .join(", ");
}

function shadow(value: Json): string {
  const layers = Array.isArray(value) ? value : [value];
  return layers
    .map((layer) => {
      if (!isObject(layer)) throw new Error(`Unsupported shadow ${JSON.stringify(layer)}`);
      const inset = layer.inset === true ? "inset " : "";
      return `${inset}${dimension(layer.offsetX)} ${dimension(layer.offsetY)} ${dimension(layer.blur)} ${dimension(layer.spread ?? 0)} ${String(layer.color)}`;
    })
    .join(", ");
}

function makeResolver(tokens: Token[]) {
  const names = new Map<string, string>();
  for (const token of tokens) {
    names.set(token.path.join("."), cssName(token.path));
    if (isObject(token.extensions) && typeof token.extensions["agesoa.stroke"] === "string") {
      names.set(`${token.path.join(".")}-stroke`, `${cssName(token.path)}-stroke`);
    }
  }
  return (raw: string, from: string): string =>
    raw.replace(/\{([^}]+)\}/g, (_match, ref: string) => {
      const name = names.get(ref);
      if (!name) throw new Error(`Token ${from} references unknown token {${ref}}`);
      return `var(${name})`;
    });
}

function formatValue(token: Token, value: Json, resolveRefs: (raw: string, from: string) => string): string {
  const from = token.path.join(".");
  if (typeof value === "string" && value.includes("{")) return resolveRefs(value, from);
  switch (token.type) {
    case "color":
      return String(value);
    case "dimension":
      return dimension(value);
    case "fontFamily":
      return fontFamily(value);
    case "fontWeight":
    case "number":
      return String(value);
    case "shadow":
      return shadow(value);
    default:
      if (typeof value === "string" || typeof value === "number") return String(value);
      throw new Error(`Unsupported token type ${token.type} at ${from}`);
  }
}

function sourceLabel(source: string): string {
  const parts = source.split(sep).join("/").split("/");
  const repo = parts.lastIndexOf("agesoa-uiux");
  return repo >= 0 ? parts.slice(repo).join("/") : basename(source);
}

function render(source: string, root: TokenNode): string {
  const tokens: Token[] = [];
  collectTokens(root, [], undefined, tokens);
  const resolveRefs = makeResolver(tokens);

  const light: Variable[] = [];
  const dark: Variable[] = [];
  const aliases: Variable[] = [];
  const seen = new Set<string>();
  const add = (list: Variable[], variable: Variable) => {
    if (list !== dark) {
      if (seen.has(variable.name)) throw new Error(`Duplicate CSS variable ${variable.name}`);
      seen.add(variable.name);
    }
    list.push(variable);
  };

  for (const token of tokens) {
    const name = cssName(token.path);
    add(light, { name, value: formatValue(token, token.value, resolveRefs), comment: token.description });
    const stroke = token.extensions?.["agesoa.stroke"];
    if (typeof stroke === "string") add(light, { name: `${name}-stroke`, value: stroke });
    const darkValue = token.extensions?.["agesoa.dark"];
    if (darkValue !== undefined) add(dark, { name, value: formatValue(token, darkValue, resolveRefs) });
    const alias = ENGLISH_ALIASES[token.path.join(".")];
    if (alias) add(aliases, { name: cssName(alias.split(".")), value: `var(${name})` });
  }

  const meta = isObject(root.$extensions) ? root.$extensions : {};
  const version = meta["agesoa.version"] ?? "unknown";
  const status = meta["agesoa.status"] ?? "unknown";
  const updated = meta["agesoa.updated"] ?? "unknown";

  const line = (v: Variable) => {
    const comment = v.comment ? ` /* ${v.comment.replace(/\*\//g, "* /")} */` : "";
    return `  ${v.name}: ${v.value};${comment}`;
  };

  let css = "";
  css += "/*\n";
  css += " * GENERATED FILE - do not edit by hand.\n";
  css += ` * Source: ${sourceLabel(source)} (version ${version}, status ${status}, updated ${updated})\n`;
  css += " * Generator: packages/ui/scripts/build-tokens.ts (bun run --cwd packages/ui build:tokens)\n";
  css += " */\n\n";
  css += ":root {\n" + light.map(line).join("\n") + "\n\n  /* English aliases */\n" + aliases.map(line).join("\n") + "\n}\n";
  if (dark.length > 0) {
    css += "\n@media (prefers-color-scheme: dark) {\n  :root {\n" + dark.map((v) => "  " + line(v)).join("\n") + "\n  }\n}\n";
  }
  return css;
}

function main() {
  const { source, out, check } = parseArgs(process.argv.slice(2));
  if (!existsSync(source)) {
    console.error(`Token source not found: ${source}\nPass the path to tokens.json as the first argument.`);
    process.exit(2);
  }
  const root = JSON.parse(readFileSync(source, "utf8")) as TokenNode;
  const css = render(source, root);
  if (check) {
    const current = existsSync(out) ? readFileSync(out, "utf8") : "";
    if (current !== css) {
      console.error(`${basename(out)} is out of date; run bun run --cwd packages/ui build:tokens`);
      process.exit(1);
    }
    console.log(`${basename(out)} is up to date`);
    return;
  }
  writeFileSync(out, css, "utf8");
  console.log(`Wrote ${basename(dirname(out))}/${basename(out)} from ${sourceLabel(source)}`);
}

main();
