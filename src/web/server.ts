import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { defaultDatabasePath, openCore } from "../core/index.ts";
import { createApi } from "./app.ts";

const port = Number(process.env.PORT ?? 3000);
const clientDir = fileURLToPath(new URL("../../dist/client", import.meta.url));
const indexHtml = `${clientDir}/index.html`;

const core = openCore(defaultDatabasePath());
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

app.route(
  "/api",
  createApi(core, {
    mcpServerPath: fileURLToPath(new URL("../mcp/server.ts", import.meta.url)),
    dataDir: process.env.DATA_DIR ? resolve(process.env.DATA_DIR) : undefined,
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

function shutDown() {
  server.close();
  core.close();
  process.exit(0);
}
process.on("SIGINT", shutDown);
process.on("SIGTERM", shutDown);
