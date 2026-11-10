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

  api.get("/candidates/:id/interviews", (c) =>
    respondOrRefuse(c, () => c.json(core.listInterviews(c.req.param("id")))),
  );

  api.post("/candidates/:id/interviews", async (c) => {
    const fields = await jsonFields(c);
    return respondOrRefuse(c, () =>
      c.json(core.addInterview({ candidateId: c.req.param("id"), date: stringField(fields, "date") }), 201),
    );
  });

  api.get("/candidates/:id/notes", (c) =>
    respondOrRefuse(c, () =>
      c.json(core.listInterviewerNotes(c.req.param("id"), { interviewId: c.req.query("interviewId") || null })),
    ),
  );

  api.post("/candidates/:id/notes", async (c) => {
    const fields = await jsonFields(c);
    return respondOrRefuse(c, () =>
      c.json(
        core.addInterviewerNotes({
          candidateId: c.req.param("id"),
          interviewId: idField(fields, "interviewId"),
          text: stringField(fields, "text"),
        }),
        201,
      ),
    );
  });

  // Sends "text" to edit a note, or "interviewId" (null for none) to change its tag.
  api.patch("/notes/:id", async (c) => {
    const fields = await jsonFields(c);
    return respondOrRefuse(c, () => {
      const id = c.req.param("id");
      let note = "text" in fields ? core.editInterviewerNote(id, stringField(fields, "text")) : undefined;
      if ("interviewId" in fields) note = core.tagInterviewerNote(id, idField(fields, "interviewId"));
      return note ? c.json(note) : c.json({ error: "Nothing to change." }, 400);
    });
  });

  api.delete("/notes/:id", (c) =>
    respondOrRefuse(c, () => {
      core.deleteInterviewerNote(c.req.param("id"));
      return c.body(null, 204);
    }),
  );

  api.get("/interface-language", (c) => c.json({ language: core.getInterfaceLanguage() }));

  api.put("/interface-language", async (c) => {
    const fields = await jsonFields(c);
    return respondOrRefuse(c, () => {
      core.setInterfaceLanguage(stringField(fields, "language"));
      return c.json({ language: core.getInterfaceLanguage() });
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

// An optional id: a missing or empty value means none.
function idField(fields: Record<string, unknown>, key: string): string | null {
  return stringField(fields, key) || null;
}

// Runs a core call and turns a refused input into a 400 response the interface can translate,
// and a request for something that does not exist into a 404 response.
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
