// Self-contained verification runner:
//   1. esbuild-bundles the real app/page.tsx + lib/* (build.mjs)
//   2. spawns the plain-Node verify server
//   3. runs the Playwright assertions
//   4. tears the server down and exits with the pass/fail code
//
// Run with: npm run verify
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import net from "node:net";

const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3210;
const BASE = `http://localhost:${PORT}`;

function waitForPort(port, timeoutMs = 15000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tryOnce = () => {
      const sock = net.connect(port, "localhost");
      sock.on("connect", () => {
        sock.destroy();
        resolve();
      });
      sock.on("error", () => {
        sock.destroy();
        if (Date.now() - start > timeoutMs) reject(new Error("server did not start"));
        else setTimeout(tryOnce, 200);
      });
    };
    tryOnce();
  });
}

await import("./build.mjs");

const server = spawn(process.execPath, [path.join(here, "dist", "server.cjs")], {
  env: { ...process.env, PORT: String(PORT) },
  stdio: "inherit",
});

let exitCode = 1;
try {
  await waitForPort(PORT);
  const { runChecks } = await import("./verify-step2.mjs");
  const fail = await runChecks(BASE);
  exitCode = fail === 0 ? 0 : 1;
} finally {
  server.kill("SIGKILL");
}
process.exit(exitCode);
