import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

function readArg(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;

  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) return fallback;
  return value;
}

const entry = resolve(".output/server/index.mjs");
if (!existsSync(entry)) {
  console.error("Missing .output/server/index.mjs. Run `npm run build` first.");
  process.exit(1);
}

const host = readArg("--host", process.env.NITRO_HOST || process.env.HOST || "127.0.0.1");
const port = readArg("--port", process.env.NITRO_PORT || process.env.PORT || "4173");

const child = spawn(process.execPath, [entry], {
  stdio: "inherit",
  env: {
    ...process.env,
    HOST: host,
    PORT: port,
    NITRO_HOST: host,
    NITRO_PORT: port,
  },
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
