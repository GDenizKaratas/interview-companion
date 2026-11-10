import { Hono, type Context } from "hono";
import { InvalidInputError, type Core } from "../core/index.ts";

// The HTTP interface of the local server. Every route only translates between HTTP and core.
export function createApi(core: Core): Hono {
  const api = new Hono();

  api.get("/candidates", (c) => c.json(core.listCandidates()));

  api.post("/candidates", async (c) => {
    const fields = await jsonFields(c);
    return refusedInput(c, () =>
      c.json(
        core.createCandidate({
          name: typeof fields.name === "string" ? fields.name : "",
          role: typeof fields.role === "string" ? fields.role : "",
        }),
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
    return refusedInput(c, () => {
      core.setInterfaceLanguage(typeof fields.language === "string" ? fields.language : "");
      return c.json({ language: core.getInterfaceLanguage() });
    });
  });

  return api;
}

async function jsonFields(c: Context): Promise<Record<string, unknown>> {
  const body: unknown = await c.req.json().catch(() => undefined);
  return typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
}

// Runs a core call and turns a refused input into a 400 response the interface can translate.
function refusedInput(c: Context, run: () => Response): Response {
  try {
    return run();
  } catch (error) {
    if (error instanceof InvalidInputError) {
      return c.json({ error: error.message, field: error.field, rule: error.rule }, 400);
    }
    throw error;
  }
}
