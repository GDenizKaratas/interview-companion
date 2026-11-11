import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openCore, type Core } from "../core/index.ts";
import { createApi } from "./app.ts";
import { localOnly } from "./local-only.ts";

let dir: string;
let core: Core;
let app: Hono;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "interview-companion-"));
  core = openCore(join(dir, "test.sqlite"));
  app = new Hono();
  app.use("*", localOnly());
  app.route("/api", createApi(core));
});

afterEach(() => {
  core.close();
  rmSync(dir, { recursive: true, force: true });
});

const addCandidate = (headers: Record<string, string>, body = JSON.stringify({ name: "Ece Yalın", role: "Backend Engineer" })) =>
  app.request("http://localhost:3000/api/candidates", { method: "POST", headers, body });

describe("Only this computer's own pages can use the local server", () => {
  it("answers the app's own page, opened as localhost or as 127.0.0.1, and through the development server", async () => {
    for (const host of ["localhost:3000", "127.0.0.1:3000", "localhost:5173"]) {
      const response = await addCandidate({
        Host: host,
        Origin: `http://${host}`,
        "Sec-Fetch-Site": "same-origin",
        "Content-Type": "application/json",
      });
      expect(response.status).toBe(201);
    }
    expect(core.listCandidates()).toHaveLength(3);
  });

  it("answers a request with no Origin, such as one sent from a terminal", async () => {
    expect((await addCandidate({ Host: "localhost:3000", "Content-Type": "application/json" })).status).toBe(201);
  });

  it("refuses a request whose Host is another name, as after DNS rebinding, even to read", async () => {
    core.createCandidate({ name: "Ece Yalın", role: "Backend Engineer" });
    const read = await app.request("http://evil.example:3000/api/candidates", { headers: { Host: "evil.example:3000" } });
    expect(read.status).toBe(403);
    const write = await addCandidate({
      Host: "evil.example:3000",
      Origin: "http://evil.example:3000",
      "Sec-Fetch-Site": "same-origin",
      "Content-Type": "application/json",
    });
    expect(write.status).toBe(403);
    expect(core.listCandidates()).toHaveLength(1);
  });

  it("refuses a change sent by another site, even as a plain form or text body", async () => {
    const fromOtherSite: Record<string, string>[] = [
      { Host: "localhost:3000", Origin: "https://evil.example", "Sec-Fetch-Site": "cross-site", "Content-Type": "text/plain" },
      { Host: "localhost:3000", Origin: "https://evil.example", "Content-Type": "text/plain" },
      { Host: "localhost:3000", "Sec-Fetch-Site": "cross-site", "Content-Type": "text/plain" },
      // Another program's page on this computer, on another port.
      { Host: "localhost:3000", Origin: "http://localhost:8080", "Sec-Fetch-Site": "same-site", "Content-Type": "application/json" },
      { Host: "localhost:3000", Origin: "null", "Content-Type": "text/plain" },
    ];
    for (const headers of fromOtherSite) expect((await addCandidate(headers)).status).toBe(403);
    expect(core.listCandidates()).toEqual([]);
  });

  it("refuses another site's change to the API key and to AI-client saving", async () => {
    const headers = { Host: "localhost:3000", Origin: "https://evil.example", "Content-Type": "application/json" };
    const key = await app.request("http://localhost:3000/api/ai/api-key", {
      method: "PUT",
      headers,
      body: JSON.stringify({ apiKey: "sk-ant-attacker" }),
    });
    const writes = await app.request("http://localhost:3000/api/ai/client-writes", {
      method: "PUT",
      headers,
      body: JSON.stringify({ allowed: true }),
    });
    expect([key.status, writes.status]).toEqual([403, 403]);
    expect(core.hasApiKey()).toBe(false);
    expect(core.aiClientWritesAllowed()).toBe(false);
  });

  it("tells the browser never to show the app inside another site's page", async () => {
    const response = await app.request("http://localhost:3000/api/candidates", { headers: { Host: "localhost:3000" } });
    expect(response.headers.get("X-Frame-Options")).toBe("DENY");
    expect(response.headers.get("Content-Security-Policy")).toBe("frame-ancestors 'none'");
  });
});
