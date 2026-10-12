# packages/ui (`@agesoa/ui`)

Shared UI foundation for `apps/portal` and `apps/witness`. At CP0 it holds the design tokens as CSS custom
properties; shared components follow when the first designs are final.

## Contents

| File | What |
|---|---|
| `tokens.css` | **Generated.** Design tokens as `--ag-*` CSS custom properties on `:root`. Do not edit by hand. |
| `scripts/build-tokens.ts` | Generator: reads the token source (W3C Design Tokens format) and writes `tokens.css`. |

## Use

```ts
// in an app's root layout (the app depends on "@agesoa/ui": "workspace:*")
import "@agesoa/ui/tokens.css";
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
- Dark mode: a token may carry a dark value in the `agesoa.dark` extension; the generator emits those under
  `@media (prefers-color-scheme: dark)`. The current token set (0.2.0, draft) has no dark values, so
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
