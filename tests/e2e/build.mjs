import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const e2eRoot = resolve(projectRoot, ".local", "e2e");
const configPath = resolve(e2eRoot, "tauri.e2e.conf.json");

mkdirSync(e2eRoot, { recursive: true });
writeFileSync(configPath, `${JSON.stringify({
  app: {
    windows: [
      {
        additionalBrowserArgs: "--remote-debugging-port=9222 --remote-allow-origins=*",
        height: 800,
        label: "main",
        maximized: true,
        minHeight: 640,
        minWidth: 960,
        title: "ProjectFlow E2E",
        width: 1280,
      },
    ],
  },
}, null, 2)}\n`, "utf8");

const result = spawnSync(
  process.execPath,
  [resolve(projectRoot, "node_modules", "@tauri-apps", "cli", "tauri.js"), "build", "--debug", "--no-bundle", "--features", "e2e", "--config", configPath],
  { cwd: projectRoot, stdio: "inherit" },
);

if (result.error !== undefined) throw result.error;
process.exit(result.status ?? 1);
