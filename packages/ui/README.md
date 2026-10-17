# packages/ui (`@agesoa/ui`)

Shared UI foundation for `apps/portal` and `apps/witness`: the design tokens as CSS custom properties, the
self-hosted fonts of the design, the shadcn theme and the React components both apps use. A component exists
once, here; an app never keeps its own copy.

## Components

`src/components/*.tsx` are shadcn components (style `base-nova`, Base UI primitives), added with the shadcn CLI
from this folder and adjusted to the Penpot variants of the design repository (`design-system/components.md`):

| Component | Penpot name | Variants |
|---|---|---|
| `button` | `Button` | `default` (Primer), `secondary` (Sekunder), `outline`, `ghost`, `destructive` (Bahaya), `link`; sizes `default` 40 px (desktop), `touch` 48 px (Witness), `sm`, `icon`, `icon-touch` |
| `badge` | `Badge`, `Badge status bukti` | `neutral`, `success`, `warning`, `destructive`, evidence `alleged` / `supported` / `proven` |
| `alert` | `Callout` | `default`, `info`, `warning`, `destructive`; no default `role` (pass `status` or `alert`) |
| `input`, `textarea`, `native-select`, `checkbox`, `radio-group`, `switch`, `label`, `field` | `Input`, `Textarea`, `Select`, `Checkbox`, `Radio`, `Switch` | 40 px controls, `border.strong` outline (3:1 on the canvas) |
| `dialog`, `toast`, `tabs`, `skeleton`, `empty`, `card`, `table`, `separator`, `spinner` | `Dialog`, `Toast`, `Tab`, `Skeleton`, `Empty state` | shadcn defaults on the AGESOA theme |

```tsx
import { Button } from "@agesoa/ui/components/button";
import { cn } from "@agesoa/ui/lib/utils";
```

- Apps resolve `@agesoa/ui/components/*` through `exports`; Next.js compiles the sources (`transpilePackages`), Vite
  does so by default. `theme.css` declares `@source "./src"`, so the apps' Tailwind build sees the classes used here.
- App styles are in `@layer components`, below the utilities of these components; keep them there.
- Add a component: `bunx --bun shadcn@4.21.0 add <name>` in this folder. The CLI writes `import { cn } from "cn"`
  for this alias layout: change it to `@agesoa/ui/lib/utils` and do not keep the `cn` npm package.

## Contents

| File | What |
|---|---|
| `tokens.css` | **Generated.** Design tokens as `--ag-*` CSS custom properties on `:root`. Do not edit by hand. |
| `scripts/build-tokens.ts` | Generator: reads the token source (W3C Design Tokens format) and writes `tokens.css`. |
| `fonts.css` | Saira (headings), IBM Plex Sans (text) and IBM Plex Mono (hashes, IDs), Latin subset, weights used by the design. Self-hosted through `@fontsource`. |
| `penpot-theme.css` | **Copied** from `agesoa-uiux/design-system/penpot-theme.css` (generated there from `tokens.json`): the shadcn variables and radius/font pins. |
| `theme.css` | shadcn theme of the apps: `penpot-theme.css` applied to a shadcn `:root`, plus the `@theme inline` colour mappings for Tailwind utilities. |
| `scripts/check-theme.ts` | Fails when `theme.css` differs from `penpot-theme.css` or the token version differs from `tokens.css`. |

## Use

```ts
// in an app's entry (the app depends on "@agesoa/ui": "workspace:*")
import "@agesoa/ui/fonts.css";
import "@agesoa/ui/tokens.css";
```

```css
/* in the app's stylesheet (Tailwind v4 + shadcn; components.json points at this file) */
@import "tailwindcss";
@import "@agesoa/ui/theme.css";
```

```css
.badge--proven {
  background: var(--ag-color-evidence-proven);
  color: var(--ag-color-text-primary);
}
```

Naming:

- Every token becomes `--ag-<path>`: `color.brand.primary` → `--ag-color-brand-primary`,
  `space.4` → `--ag-space-4`, `font.size.md` → `--ag-font-size-md`.
- Semantic tokens drop the `semantic` prefix and point at the base token:
  `semantic.color.text.primary` → `--ag-color-text-primary: var(--ag-color-neutral-text)`. Prefer these in
  components.
- A role colour with a stroke colour gets an extra `-stroke` variable (`--ag-color-role-warga-stroke`).
- Evidence status and simulation colours also have English aliases:
  `--ag-color-evidence-alleged`, `--ag-color-evidence-supported`, `--ag-color-evidence-proven`,
  `--ag-color-simulation-band`, `--ag-color-simulation-on-band`.
- Tailwind's preflight is on, in `@layer base`. The apps' own rules are unlayered and win, but a property the app
  does not set falls back to the preflight reset: set `font-weight`, `text-decoration` and `list-style` of an
  element explicitly (the preflight made headings regular and removed link underlines before the apps did).
- Dark mode: a token may carry a dark value in the `agesoa.dark` extension; the generator emits those under
  `@media (prefers-color-scheme: dark)`. The current token set (0.4.0) has no dark values, so
  `tokens.css` is light only.

## Regenerate

The token source lives in the design repository (`agesoa-uiux`, `design-system/tokens.json`), checked out next
to this repository. From the repository root:

```sh
bun run ui:tokens                                   # default source: ../../../agesoa-uiux/design-system/tokens.json
bun run --cwd packages/ui build:tokens -- <path/to/tokens.json>
bun packages/ui/scripts/build-tokens.ts --check     # exit 1 if tokens.css is out of date
```

The output is deterministic (no timestamps); the header records the source file and its token version. Commit
`tokens.css` together with the design-repository commit it came from in the message.

## shadcn theme

`components.json` of each app points at its stylesheet (`apps/portal/src/app/globals.css`,
`apps/witness/src/styles.css`); components are added with `bunx --bun shadcn@4.21.0 add <name>` from the app folder.
The theme comes from the design repository, not from a shadcn preset:

```sh
# in agesoa-uiux: tokens.json -> design-system/penpot-theme.css
bun design-system/scripts/shadcn-theme.ts
# in this package: copy it, apply it to theme.css (uiux-design skill checker: replaces each variable, exits 1 if one did not land)
cp ../../../agesoa-uiux/design-system/penpot-theme.css penpot-theme.css
bun run <skills>/uiux-design/bin/shadcn-theme.mjs theme.css penpot-theme.css
bun run ui:theme:check                              # from the repository root
```

Mapping (design token -> shadcn variable): `bg.canvas` -> `--background`, `bg.surface` -> `--card`/`--popover`,
`text.primary` -> `--foreground`, `action.primary` -> `--primary`, `action.secondary` -> `--secondary`,
`bg.sunken` -> `--muted`/`--accent`, `text.secondary` -> `--muted-foreground`, `status.danger` -> `--destructive`,
`border.default` -> `--border`/`--input`, `focus.ring` -> `--ring`. Controls use `radius.md` (8 px, Button in the
Penpot file) and surfaces `radius.lg` (16 px, Card temuan). Commit messages that change these files name the
design commit and token version (`agesoa-uiux@<sha>`, tokens 0.4.0).
