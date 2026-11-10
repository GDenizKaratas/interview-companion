import { Hono, type Context } from "hono";
import { InvalidInputError, NotFoundError, type Core } from "../core/index.ts";

// The HTTP interface of the local server. Every route only translates between HTTP and core.
export function createApi(core: Core): Hono {
  const api = new Hono();

  api.get("/candidates", (c) => c.json(core.listCandidates()));

  api.post("/candidates", async (c) => {
    const fields = await jsonFields(c);
    return respondOrRefuse(c, () =>
      c.json(
        core.createCandidate({ name: stringField(fields, "name"), role: stringField(fields, "role") }),
        201,
      ),
    );
  });

  api.get("/candidate-roles", (c) => c.json(core.listCandidateRoles()));

  api.get("/candidates/:id", (c) => {
    const candidate = core.getCandidate(c.req.param("id"));
    return candidate ? c.json(candidate) : c.json({ error: "Candidate not found." }, 404);
  });

  api.get("/interface-language", (c) => c.json({ language: core.getInterfaceLanguage() }));

  api.put("/interface-language", async (c) => {
    const fields = await jsonFields(c);
    return respondOrRefuse(c, () => {
      core.setInterfaceLanguage(stringField(fields, "language"));
      return c.json({ language: core.getInterfaceLanguage() });
    });
  });

  api.get("/candidates/:id/saved-questions", (c) => {
    const candidateId = c.req.param("id");
    if (!core.getCandidate(candidateId)) return c.json({ error: "Candidate not found." }, 404);
    return c.json(core.listSavedQuestions(candidateId));
  });

  api.post("/candidates/:id/saved-questions", async (c) => {
    const fields = await jsonFields(c);
    return respondOrRefuse(c, () =>
      c.json(core.addSavedQuestion({ candidateId: c.req.param("id"), text: stringField(fields, "text") }), 201),
    );
  });

  api.put("/saved-questions/:id", async (c) => {
    const fields = await jsonFields(c);
    return respondOrRefuse(c, () => c.json(core.editSavedQuestion(c.req.param("id"), stringField(fields, "text"))));
  });

  api.delete("/saved-questions/:id", (c) =>
    respondOrRefuse(c, () => {
      core.deleteSavedQuestion(c.req.param("id"));
      return c.body(null, 204);
    }),
  );

  api.put("/saved-questions/:id/position", async (c) => {
    const fields = await jsonFields(c);
    return respondOrRefuse(c, () => {
      core.moveSavedQuestion(c.req.param("id"), typeof fields.position === "number" ? fields.position : Number.NaN);
      return c.body(null, 204);
    });
  });

  return api;
}

async function jsonFields(c: Context): Promise<Record<string, unknown>> {
  const body: unknown = await c.req.json().catch(() => undefined);
  return typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
}

function stringField(fields: Record<string, unknown>, key: string): string {
  const value = fields[key];
  return typeof value === "string" ? value : "";
}

// Runs a core call and turns a refused input into a 400 response the interface can translate,
// and a reference to something that does not exist into a 404 response.
function respondOrRefuse(c: Context, run: () => Response): Response {
  try {
    return run();
  } catch (error) {
    if (error instanceof InvalidInputError) {
      return c.json({ error: error.message, field: error.field, rule: error.rule }, 400);
    }
    if (error instanceof NotFoundError) {
      return c.json({ error: error.message }, 404);
    }
    throw error;
  }
}
