// Bundles the verification harness with esbuild.
//
// This exists ONLY because Next's dev/build pipeline wedged in the local
// environment (see README). It bundles the REAL app/page.tsx and lib/* so a
// headless browser can exercise them. It is NOT used by the app or `next build`.
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const alias = { "@": root };

// Browser bundle: mounts the real app/page.tsx.
await build({
  entryPoints: [path.join(here, "entry.tsx")],
  outfile: path.join(here, "dist", "app.js"),
  bundle: true,
  jsx: "automatic",
  alias,
  define: { "process.env.NODE_ENV": '"development"' },
  loader: { ".tsx": "tsx" },
});

// Node server bundle: serves the page + reuses the real lib/mapping + lib/cms.
await build({
  entryPoints: [path.join(here, "server.ts")],
  outfile: path.join(here, "dist", "server.cjs"),
  bundle: true,
  platform: "node",
  format: "cjs",
  alias,
});

console.log("verification bundles built -> verification/dist/");
