import { existsSync, readFileSync } from "node:fs";
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
const app = new Hono();

app.route("/api", createApi(core));

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
