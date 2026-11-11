import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { defaultDatabasePath, openCore } from "../core/index.ts";
import { createApi } from "./app.ts";
import { claudeDesktopConfigPath } from "./claude-desktop.ts";
import { listenFailureMessage } from "./listen-error.ts";
import { localOnly } from "./local-only.ts";

const port = Number(process.env.PORT ?? 3000);
const clientDir = fileURLToPath(new URL("../../dist/client", import.meta.url));
const indexHtml = `${clientDir}/index.html`;

const databasePath = defaultDatabasePath();
const core = openCore(databasePath);
// Where the Candidates and the API key are, so the Interviewer can find or back up the folder.
console.log(`Data folder: ${dirname(databasePath)}`);
// A new Interviewer sees the demo Candidate the first time the app starts. It is only a
// convenience, so if it fails the app still starts; `npm run demo` can load it later.
try {
  const demo = await core.loadDemoCandidateOnFirstStart();
  if (demo) {
    console.log(`First start: loaded the demo Candidate, ${demo.name}. Delete them from their Workspace at any time.`);
  }
} catch (error) {
  console.error("The demo Candidate could not be loaded. Run `npm run demo` to load it.", error);
}
const app = new Hono();
// Only this computer's own pages may use the server (local-only.ts), for the API and the page alike.
app.use("*", localOnly());

app.route(
  "/api",
  createApi(core, {
    mcpServerPath: fileURLToPath(new URL("../mcp/server.ts", import.meta.url)),
    dataDir: process.env.DATA_DIR ? resolve(process.env.DATA_DIR) : undefined,
    // CLAUDE_DESKTOP_CONFIG points the one-click connect at another file, for trying it out
    // without touching the real Claude Desktop configuration.
    claudeDesktopConfigPath: process.env.CLAUDE_DESKTOP_CONFIG
      ? resolve(process.env.CLAUDE_DESKTOP_CONFIG)
      : claudeDesktopConfigPath({ platform: process.platform, home: homedir(), appData: process.env.APPDATA }),
  }),
);

if (existsSync(indexHtml)) {
  app.use("/*", serveStatic({ root: clientDir }));
  // Any other path is a page of the browser interface.
  app.get("*", (c) => c.html(readFileSync(indexHtml, "utf8")));
}

// Listen on the loopback address only: the app is for this machine, not the network.
const server = serve({ fetch: app.fetch, port, hostname: "127.0.0.1" }, () => {
  console.log(`Interview Companion is running at http://localhost:${port}`);
  if (!existsSync(indexHtml)) {
    console.log("The browser interface is not built. Use `npm start`, or `npm run dev` while developing.");
  }
});

// A port that is taken, most often by the app already running, gets a plain message, not a stack trace.
server.on("error", (error) => {
  const message = listenFailureMessage(error, port);
  if (!message) throw error;
  console.error(message);
  core.close();
  process.exit(1);
});

function shutDown() {
  server.close();
  core.close();
  process.exit(0);
}
process.on("SIGINT", shutDown);
process.on("SIGTERM", shutDown);
