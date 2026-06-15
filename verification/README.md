# Verification harness (not part of the app)

A headless-browser harness that exercises the **real** app — render checks and
PDF generation — for fast, scriptable verification. `verify-step2` bundles the
real `app/page.tsx` + `lib/*` with esbuild and serves them from a plain-Node
server; `verify-step3` drives the production server (`next start`) and parses
the downloaded PDF.

## Isolation guarantees

This folder is **not** imported by the app and **not** part of `next build`:

- The dependency direction is one-way: the harness imports from `app/` and
  `lib/`, never the reverse.
- `verification/**` is excluded from `tsconfig.json` and ignored by ESLint, so
  `next build`'s type-check/lint never touch it.
- It is not under `app/` or `pages/`, so Next never routes or bundles it.
- Its tools (`esbuild`, `playwright`, `@playwright/test`, `pdfjs-dist`) are
  `devDependencies` only — the app's runtime and production build never require them.
- Generated output (`dist/`, screenshots, sample PDFs) is git-ignored.

## Run

```bash
# Step 2 — render checks (self-contained: bundles + serves on :3210)
npm run verify

# Step 3 — PDF checks against the production server
npm run build && PORT=3010 npm start &
node verification/verify-step3.mjs
```

`verify-step2` writes `verification/verify-step2.png`; `verify-step3` writes
`verification/step3-sample.pdf`. Both exit non-zero on any failure.

## Files

- `entry.tsx` — mounts the real `app/page.tsx` for the browser bundle.
- `server.ts` — plain-Node HTTP server that serves the page and reuses the real
  `lib/cms` + `lib/mapping` for the `/api/facility` proxy.
- `verify-step2.mjs` — render assertions (`runChecks()`).
- `verify-step3.mjs` — downloads the PDF, parses it (pdfjs), checks field values,
  branding, and the clickable Medicare link.
- `build.mjs` — esbuild bundling.
- `run.mjs` — orchestrates build → server → checks → teardown (`npm run verify`).
