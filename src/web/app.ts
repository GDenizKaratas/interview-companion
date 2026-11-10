import { Hono } from "hono";
import type { Context } from "hono";
import { InvalidInputError, NotFoundError, type Core } from "../core/index.ts";

// The HTTP interface of the local server. Every route only translates between HTTP and core.
export function createApi(core: Core): Hono {
  const api = new Hono();

  api.get("/candidates", (c) => c.json(core.listCandidates()));

  api.post("/candidates", async (c) => {
    const fields = await jsonFields(c.req.raw);
    try {
      const candidate = core.createCandidate({
        name: typeof fields.name === "string" ? fields.name : "",
        role: typeof fields.role === "string" ? fields.role : "",
      });
      return c.json(candidate, 201);
    } catch (error) {
      return coreErrorResponse(c, error);
    }
  });

  api.get("/candidate-roles", (c) => c.json(core.listCandidateRoles()));

  api.get("/candidates/:id", (c) => {
    const candidate = core.getCandidate(c.req.param("id"));
    return candidate ? c.json(candidate) : c.json({ error: "Candidate not found." }, 404);
  });

  api.get("/candidates/:id/interviews", (c) => {
    const candidateId = c.req.param("id");
    if (!core.getCandidate(candidateId)) return c.json({ error: "Candidate not found." }, 404);
    return c.json(core.listInterviews(candidateId));
  });

  api.post("/candidates/:id/interviews", async (c) => {
    const fields = await jsonFields(c.req.raw);
    try {
      const interview = core.addInterview({
        candidateId: c.req.param("id"),
        stage: typeof fields.stage === "string" ? fields.stage : "",
        date: typeof fields.date === "string" ? fields.date : null,
      });
      return c.json(interview, 201);
    } catch (error) {
      return coreErrorResponse(c, error);
    }
  });

  api.get("/interview-stages", (c) => c.json(core.listInterviewStages()));

  return api;
}

// Turns an error from core into an HTTP answer. Errors core does not explain are passed on.
function coreErrorResponse(c: Context, error: unknown): Response {
  if (error instanceof InvalidInputError) {
    return c.json({ error: error.message, field: error.field }, 400);
  }
  if (error instanceof NotFoundError) {
    return c.json({ error: error.message }, 404);
  }
  throw error;
}

// The fields of a JSON request body, or no fields when the body is not a JSON object.
async function jsonFields(request: Request): Promise<Record<string, unknown>> {
  const body: unknown = await request.json().catch(() => undefined);
  return typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
}
