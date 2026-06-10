# Plan 009: Cut initial bundle and asset weight (gsap, pdfjs, images)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 3cae505..HEAD -- apps/web/app/layout.tsx apps/web/components/mail/attachment-preview-dialog.tsx apps/web/serve.json apps/web/public apps/web/app/home-page-client.tsx apps/web/app/login/_content.tsx apps/web/app/privacy/page.tsx`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M (three small independent parts)
- **Risk**: LOW
- **Depends on**: none
- **Category**: perf
- **Planned at**: commit `3cae505`, 2026-06-10

## Why this matters

This app is a fully static export (`output: "export"` in `apps/web/next.config.ts`), so everything renders client-side and initial JS/asset weight directly delays first paint and interactivity. Three independent costs:

1. **gsap** (~25-30 KB gz core + a 681-line provider) is statically imported in the root layout, so it loads and executes on first paint of every route — including `/login` and the home page, where TTI matters most. Animations are progressive enhancement and can load after mount.
2. **pdfjs-dist** (hundreds of KB minified) is statically imported by `attachment-preview-dialog.tsx`, which is statically imported by `mail-app.tsx` and `message-reader.tsx` — every `/mail` visitor downloads and parses a PDF engine even if they never open a PDF.
3. **Images**: `public/logo.png` is 1.6 MB and referenced nowhere in `apps/web` (dead deploy weight); the home/login/privacy wallpapers are ~650 KB JPEGs with no responsive variants; `serve.json` sets long-lived caching only for `/_next/static/**`, so images revalidate every visit.

## Current state

- `apps/web/app/layout.tsx:1-6,67` — static import and mount:

```tsx
import {
  GsapAnimationProvider,
  ThemeProvider,
  LoadingProvider,
} from "@workspace/ui/providers";
...
<body ...>
  <GsapAnimationProvider />
  <RouteTransitionProvider>
```

`GsapAnimationProvider` (`packages/ui/src/providers/gsap-animation-provider.tsx`, 681 lines) renders no UI — it installs a MutationObserver/animation system as a side effect and returns null-ish. It statically imports gsap via `../lib/gsap`.

- `apps/web/components/mail/attachment-preview-dialog.tsx:13-14`:

```tsx
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import { GlobalWorkerOptions, getDocument } from "pdfjs-dist";
```

The file already lazy-loads the pdf *worker* (`ensurePdfWorker()` sets `GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs"`), but the library itself is eager. Consumers: `mail-app.tsx:696` renders `<AttachmentPreviewDialog ...>`; `message-reader.tsx:2112` renders `<PdfAttachmentThumbnail url={...}>` (exported from the same file).

- Assets (`ls -la apps/web/public`): `logo.png` 1,649,934 B (zero references in `apps/web`; native apps reference their own bundled asset, not this file), `wallpaper.jpg` 637,969 B (used at `login/_content.tsx:1198`, `privacy/page.tsx:367`), `wallpaper02.jpg` 665,926 B (used at `home-page-client.tsx:853`), `favicon-512x512.png` 174,784 B.

- `apps/web/serve.json` — has cache rules for `/_next/static/**` (immutable) and `/**/*.html` (must-revalidate) only.

- Repo command note: this is a Bun monorepo; the web app builds with `bun --bun next build`, but agents must NOT run builds (writes artifacts). Verification is typecheck/lint/tests only.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Typecheck (web) | `cd apps/web && bun run typecheck` | exit 0 |
| Lint | `bun run lint` | exit 0 |
| Web tests | `cd apps/web && bun run test` | all pass |
| Image conversion | `command -v cwebp \|\| command -v magick \|\| command -v sips` | at least one exists (macOS has `sips`) |

## Scope

**In scope**:
- `apps/web/app/layout.tsx`
- `apps/web/components/mail/attachment-preview-dialog.tsx`
- `apps/web/components/mail/mail-app.tsx`, `apps/web/components/mail/message-reader.tsx` (import changes only)
- `apps/web/serve.json`
- `apps/web/public/` (add WebP variants, delete `logo.png`)
- `apps/web/app/home-page-client.tsx`, `apps/web/app/login/_content.tsx`, `apps/web/app/privacy/page.tsx` (img tag updates only)

**Out of scope**:
- `packages/ui/src/providers/gsap-animation-provider.tsx` internals — do not refactor the animation system
- `public/pdf.worker.min.mjs` — already lazy, leave it
- Favicons other than verifying sizes (do not regenerate icon sets)
- Any visual/layout change to home/login/privacy beyond swapping image sources

## Git workflow

- Branch: `advisor/009-bundle-and-asset-diet`
- One commit per part (gsap / pdfjs / assets); short imperative messages.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Defer gsap out of the first paint

In `apps/web/app/layout.tsx`, the layout is a Server Component shell in a static export, so `next/dynamic` with `ssr:false` must live in a client file. Create `apps/web/components/gsap-provider-lazy.tsx`:

```tsx
"use client";

import dynamic from "next/dynamic";

export const GsapAnimationProviderLazy = dynamic(
  () =>
    import("@workspace/ui/providers").then(
      (mod) => mod.GsapAnimationProvider,
    ),
  { ssr: false },
);
```

In `layout.tsx`, remove `GsapAnimationProvider` from the `@workspace/ui/providers` import (keep `ThemeProvider`, `LoadingProvider`) and replace `<GsapAnimationProvider />` with `<GsapAnimationProviderLazy />` imported from the new file.

Caveat: `import("@workspace/ui/providers")` only helps if the providers barrel doesn't statically re-export everything into the same chunk — check `packages/ui/src/providers/index.ts`. If the barrel would pull gsap anyway, import the provider file directly: `import("@workspace/ui/providers/gsap-animation-provider")` — check `packages/ui/package.json` `exports` to see if that subpath resolves; if not, this is a STOP condition (report; adding an export subpath touches a shared package).

**Verify**: `cd apps/web && bun run typecheck` → exit 0; `rg -n 'GsapAnimationProvider' apps/web/app/layout.tsx` shows only the lazy wrapper.

### Step 2: Lazy-load pdfjs-dist

In `attachment-preview-dialog.tsx`:

1. Keep the type-only import (`import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist"`) — types are free.
2. Delete the value import of `GlobalWorkerOptions, getDocument`.
3. Replace `ensurePdfWorker()` with an async loader:

```ts
let pdfjsModulePromise: Promise<typeof import("pdfjs-dist")> | null = null;

function loadPdfjs() {
  if (!pdfjsModulePromise) {
    pdfjsModulePromise = import("pdfjs-dist").then((mod) => {
      mod.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
      return mod;
    });
  }
  return pdfjsModulePromise;
}
```

4. Update every call site in the file that used `getDocument(...)` to `const { getDocument } = await loadPdfjs();` first (these are inside effects/async handlers already — find them with `rg -n 'getDocument' apps/web/components/mail/attachment-preview-dialog.tsx`). Remove the old `pdfWorkerConfigured` flag and `ensurePdfWorker`.

This keeps the component's public API unchanged, so `mail-app.tsx` and `message-reader.tsx` need no edits (only touch them if the typecheck demands it).

**Verify**: `cd apps/web && bun run typecheck` → exit 0; `rg -n '^import \{ GlobalWorkerOptions' apps/web/components/mail/attachment-preview-dialog.tsx` → no match.

### Step 3: Delete the dead logo and convert wallpapers to WebP

1. Confirm `logo.png` is unreferenced: `rg -n 'logo\.png' apps/web --glob '!node_modules'` → no matches (verified at planning time). Also check string-built paths: `rg -n '"/logo' apps/web` → no matches. Then `git rm apps/web/public/logo.png`.
2. Generate WebP variants (quality ~80) next to the originals, e.g. with macOS `sips` or `cwebp`:
   - `wallpaper.webp`, `wallpaper02.webp` at original size
   - `wallpaper-1280.webp`, `wallpaper02-1280.webp` resized to 1280px wide
   Expected: each WebP at most ~40-60% of the JPEG size; if a variant is not smaller than the original, keep the original for that slot and note it.
3. Update the three `<img>` tags to use `srcSet`/`sizes` (plain `<img>`, NOT `next/image` — image optimization is unavailable with `output: "export"`):

```tsx
<img
  src="/wallpaper02.webp"
  srcSet="/wallpaper02-1280.webp 1280w, /wallpaper02.webp 2400w"
  sizes="100vw"
  ...keep existing alt/className/loading attributes...
/>
```

Adjust the `2400w` descriptor to the actual pixel width of each original (check with `sips -g pixelWidth`). Keep the JPEG files in `public/` (external references may exist); only the `<img>` tags change.

**Verify**: `cd apps/web && bun run typecheck` → exit 0; `ls -la apps/web/public/*.webp` shows the new files; `rg -n 'wallpaper.*\.jpg' apps/web/app` → no remaining `<img src>` usages (JPEGs may still exist on disk).

### Step 4: Cache headers for images

In `apps/web/serve.json`, add a rule alongside the existing ones:

```json
{
  "source": "/**/*.{jpg,jpeg,png,webp,avif}",
  "headers": [
    { "key": "Cache-Control", "value": "public, max-age=604800, stale-while-revalidate=86400" }
  ]
}
```

One week, not immutable — these filenames are not content-hashed. Validate JSON: `bun -e "JSON.parse(require('fs').readFileSync('apps/web/serve.json','utf8')); console.log('ok')"` → `ok`.

**Verify**: command above prints `ok`.

## Test plan

- `cd apps/web && bun run test` → all pass (mail tests cover the attachment preview path; if a test stubs `pdfjs-dist`, update the mock for the dynamic import — Jest config is `apps/web/jest.config.cjs`).
- No new tests required for the layout/img/serve.json changes (config + markup).

## Done criteria

- [ ] `cd apps/web && bun run typecheck` exits 0
- [ ] `bun run lint` exits 0
- [ ] `cd apps/web && bun run test` exits 0
- [ ] `rg -n 'from "pdfjs-dist"' apps/web/components/mail/attachment-preview-dialog.tsx` matches only the `import type` line
- [ ] `apps/web/public/logo.png` does not exist
- [ ] `serve.json` parses and contains the image cache rule
- [ ] No files outside the in-scope list modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back if:

- The providers barrel cannot be split and no subpath export exists for the gsap provider (Step 1 caveat) — changing `packages/ui` exports needs owner sign-off.
- Any reference to `/logo.png` is found anywhere in the repo (including backend mail templates: `rg -n 'logo\.png' apps/backend apps/notifications`).
- No image conversion tool is available on the machine.
- A mail test fails due to the pdfjs dynamic import after one mock-update attempt.

## Maintenance notes

- New heavyweight deps must follow this pattern: dynamic `import()` at the feature boundary, never a static import reachable from layout/route entry. Reviewers should check import chains for anything > ~50 KB.
- If wallpapers are ever replaced, regenerate both WebP sizes and keep the `srcSet` descriptors accurate.
- Deferred: `favicon-512x512.png` (172 KB) recompression — minor; and auditing other static imports in the mail chunk (`postal-mime`, `hash-wasm` — the latter is covered by Plan 013).
