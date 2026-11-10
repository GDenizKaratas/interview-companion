import { Hono } from "hono";
import { InvalidInputError, type Core } from "../core/index.ts";

// The HTTP interface of the local server. Every route only translates between HTTP and core.
export function createApi(core: Core): Hono {
  const api = new Hono();

  api.get("/candidates", (c) => c.json(core.listCandidates()));

  api.post("/candidates", async (c) => {
    const body: unknown = await c.req.json().catch(() => undefined);
    const fields = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
    try {
      const candidate = core.createCandidate({
        name: typeof fields.name === "string" ? fields.name : "",
        role: typeof fields.role === "string" ? fields.role : "",
      });
      return c.json(candidate, 201);
    } catch (error) {
      if (error instanceof InvalidInputError) {
        return c.json({ error: error.message, field: error.field }, 400);
      }
      throw error;
    }
  });

  api.get("/candidate-roles", (c) => c.json(core.listCandidateRoles()));

  api.get("/candidates/:id", (c) => {
    const candidate = core.getCandidate(c.req.param("id"));
    return candidate ? c.json(candidate) : c.json({ error: "Candidate not found." }, 404);
  });

  return api;
}
