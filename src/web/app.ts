import { Hono, type Context } from "hono";
import {
  AiProviderError,
  InvalidInputError,
  NotFoundError,
  PreconditionError,
  type Core,
  type CvFile,
  type EvidenceSources,
  type SpeakerRole,
} from "../core/index.ts";

// The HTTP interface of the local server. Every route only translates between HTTP and core.
// mcpServerPath is the absolute path of the MCP server's file, so the interface can show the
// exact command that connects an AI client to it.
export function createApi(core: Core, options: { mcpServerPath?: string } = {}): Hono {
  const api = new Hono();

  // Every Candidate's overview, newest Candidate first, for the Candidate list and the calendar.
  api.get("/candidate-overviews", (c) => c.json(core.listCandidates().map((candidate) => core.getCandidateOverview(candidate.id))));

  // The command that adds the MCP server to Claude Code, or null when the path is not known.
  api.get("/mcp-setup", (c) =>
    c.json({ command: options.mcpServerPath ? `claude mcp add interview-companion -- node ${shellQuoted(options.mcpServerPath)}` : null }),
  );

  api.get("/candidates", (c) => c.json(core.listCandidates()));

  // A JSON body adds a Candidate by hand. A form with a "cv" file adds the Candidate and the CV together.
  api.post("/candidates", async (c) => {
    if (!isForm(c)) {
      const fields = await jsonFields(c);
      return respondOrRefuse(c, () =>
        c.json(core.createCandidate({ name: stringField(fields, "name"), role: stringField(fields, "role") }), 201),
      );
    }
    const form = await c.req.parseBody();
    const input = { name: stringField(form, "name"), role: stringField(form, "role") };
    const cv = await fileField(form, "cv");
    return respondOrRefuse(c, async () =>
      c.json(cv ? await core.createCandidateWithCv({ ...input, cv }) : core.createCandidate(input), 201),
    );
  });

  // Only a suggestion for the name box; nothing is stored.
  api.post("/cv-name-guess", async (c) => {
    const cv = await fileField(await c.req.parseBody(), "cv");
    return c.json({ name: cv ? await core.guessCandidateName(cv) : "" });
  });

  // The CV's file name, upload time, and text per page, or null when the Candidate has no CV.
  api.get("/candidates/:id/cv", (c) => c.json(core.getCv(c.req.param("id")) ?? null));

  api.get("/candidates/:id/cv/file", (c) => {
    const file = core.readCvFile(c.req.param("id"));
    if (!file) return c.json({ error: "This Candidate has no CV." }, 404);
    // The bytes are the uploaded file: never sniffed as another type, never cached after a replacement.
    return c.body(file.bytes.slice().buffer, 200, {
      "Content-Type": "application/pdf",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-store",
    });
  });

  // Uploads a CV as a form with a "cv" file. It replaces the Candidate's earlier CV.
  api.post("/candidates/:id/cv", async (c) => {
    const cv = (await fileField(await c.req.parseBody(), "cv")) ?? { fileName: "", bytes: new Uint8Array() };
    return respondOrRefuse(c, async () => c.json(await core.attachCv(c.req.param("id"), cv), 201));
  });

  // Searches the Candidate's CV and Transcripts. ?q= is the search, ?sources= is all, cv, or
  // transcripts (all when left out), and ?candidateOnly=true keeps only what the Candidate said.
  api.get("/candidates/:id/evidence", (c) =>
    respondOrRefuse(c, () =>
      c.json(
        core.searchEvidence(c.req.param("id"), {
          query: c.req.query("q") ?? "",
          sources: (c.req.query("sources") ?? "all") as EvidenceSources,
          candidateOnly: c.req.query("candidateOnly") === "true",
        }),
      ),
    ),
  );

  // The Transcript formats core can import, so the interface can offer and name them.
  api.get("/transcript-formats", (c) => c.json(core.listTranscriptFormats()));

  // The Interview's Transcript, or null when none has been imported.
  api.get("/interviews/:id/transcript", (c) => c.json(core.getTranscript(c.req.param("id")) ?? null));

  // Imports a Transcript as a form with a "transcript" file. It replaces the Interview's earlier one.
  api.post("/interviews/:id/transcript", async (c) => {
    const file = (await fileField(await c.req.parseBody(), "transcript")) ?? { fileName: "", bytes: new Uint8Array() };
    return respondOrRefuse(c, () => c.json(core.importTranscript(c.req.param("id"), file), 201));
  });

  // Confirms the Speaker Mapping. The body is { roles: { <speaker id>: "candidate" | "interviewer" | "other" } }.
  api.put("/interviews/:id/speaker-mapping", async (c) => {
    const fields = await jsonFields(c);
    const roles = typeof fields.roles === "object" && fields.roles !== null && !Array.isArray(fields.roles) ? fields.roles : {};
    return respondOrRefuse(c, () =>
      c.json(core.confirmSpeakerMapping(c.req.param("id"), roles as Record<string, SpeakerRole>)),
    );
  });

  // Only whether a key is saved. The key itself never leaves core.
  api.get("/ai/api-key", (c) => c.json({ saved: core.hasApiKey() }));

  api.put("/ai/api-key", async (c) => {
    const fields = await jsonFields(c);
    return respondOrRefuse(c, () => {
      core.saveApiKey(stringField(fields, "apiKey"));
      return c.json({ saved: true });
    });
  });

  api.delete("/ai/api-key", (c) => {
    core.removeApiKey();
    return c.body(null, 204);
  });

  api.get("/interviews/:id/ai-notes", (c) => respondOrRefuse(c, () => c.json(core.listAiNotes(c.req.param("id")))));

  // Review of one AI Note. Each answers with the note as it now is.
  api.post("/ai-notes/:id/confirm", (c) => respondOrRefuse(c, () => c.json(core.confirmAiNote(c.req.param("id")))));
  api.post("/ai-notes/:id/dismiss", (c) => respondOrRefuse(c, () => c.json(core.dismissAiNote(c.req.param("id")))));
  api.post("/ai-notes/:id/restore", (c) => respondOrRefuse(c, () => c.json(core.restoreAiNote(c.req.param("id")))));
  api.put("/ai-notes/:id/correction", async (c) => {
    const fields = await jsonFields(c);
    return respondOrRefuse(c, () =>
      c.json(core.correctAiNote(c.req.param("id"), stringField(fields, "correction"))),
    );
  });

  // Generates the Interview's AI Notes with the model. Only this route ever calls it.
  api.post("/interviews/:id/ai-notes", (c) =>
    respondOrRefuse(c, async () => c.json(await core.generateAiNotes(c.req.param("id")), 201)),
  );

  api.get("/candidate-roles", (c) => c.json(core.listCandidateRoles()));

  api.get("/candidates/:id", (c) => {
    const candidate = core.getCandidate(c.req.param("id"));
    return candidate ? c.json(candidate) : c.json({ error: "Candidate not found." }, 404);
  });

  api.delete("/candidates/:id", (c) =>
    respondOrRefuse(c, () => {
      core.deleteCandidate(c.req.param("id"));
      return c.body(null, 204);
    }),
  );

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

  api.put("/notes/:id/text", async (c) => {
    const fields = await jsonFields(c);
    return respondOrRefuse(c, () => c.json(core.editInterviewerNote(c.req.param("id"), stringField(fields, "text"))));
  });

  // The Interview a note is tagged with; a missing or empty interviewId removes the tag.
  api.put("/notes/:id/interview", async (c) => {
    const fields = await jsonFields(c);
    return respondOrRefuse(c, () =>
      c.json(core.tagInterviewerNote(c.req.param("id"), idField(fields, "interviewId"))),
    );
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

  api.get("/candidates/:id/saved-questions", (c) =>
    respondOrRefuse(c, () => c.json(core.listSavedQuestions(c.req.param("id")))),
  );

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

  api.get("/candidates/:id/suggested-questions", (c) =>
    respondOrRefuse(c, () => c.json(core.listSuggestedQuestions(c.req.param("id")))),
  );

  // Asks the model for Suggested Questions. Only this route ever calls it.
  api.post("/candidates/:id/suggested-questions", async (c) => {
    const fields = await jsonFields(c);
    return respondOrRefuse(c, async () =>
      c.json(await core.generateSuggestedQuestions(c.req.param("id"), { focus: stringField(fields, "focus") }), 201),
    );
  });

  // Copies the suggestion into Saved Questions and answers with the new Saved Question.
  api.post("/suggested-questions/:id/accept", (c) =>
    respondOrRefuse(c, () => c.json(core.acceptSuggestedQuestion(c.req.param("id")), 201)),
  );
  api.put("/suggested-questions/:id", async (c) => {
    const fields = await jsonFields(c);
    return respondOrRefuse(c, () =>
      c.json(core.editSuggestedQuestion(c.req.param("id"), stringField(fields, "text"))),
    );
  });
  api.post("/suggested-questions/:id/dismiss", (c) =>
    respondOrRefuse(c, () => c.json(core.dismissSuggestedQuestion(c.req.param("id")))),
  );
  api.post("/suggested-questions/:id/restore", (c) =>
    respondOrRefuse(c, () => c.json(core.restoreSuggestedQuestion(c.req.param("id")))),
  );

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

function isForm(c: Context): boolean {
  return (c.req.header("Content-Type") ?? "").startsWith("multipart/form-data");
}

// The file sent in a form field, or undefined when the field holds no file.
async function fileField(form: Record<string, unknown>, key: string): Promise<CvFile | undefined> {
  const value = form[key];
  if (!(value instanceof File)) return undefined;
  return { fileName: value.name, bytes: new Uint8Array(await value.arrayBuffer()) };
}

// An optional id: a missing or empty value means none.
function idField(fields: Record<string, unknown>, key: string): string | null {
  return stringField(fields, key) || null;
}

// Runs a core call and turns a refused input into a 400 response the interface can translate,
// a request for something that does not exist into a 404 response, an action that must wait
// for another step into 409, and a failed model call into 502.
async function respondOrRefuse(c: Context, run: () => Response | Promise<Response>): Promise<Response> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof InvalidInputError) {
      return c.json({ error: error.message, field: error.field, rule: error.rule }, 400);
    }
    if (error instanceof NotFoundError) {
      return c.json({ error: error.message }, 404);
    }
    if (error instanceof PreconditionError) {
      return c.json({ error: error.message, reason: error.reason }, 409);
    }
    if (error instanceof AiProviderError) {
      console.error("AI generation failed:", error.cause ?? error);
      return c.json({ error: error.message, failure: error.failure }, 502);
    }
    throw error;
  }
}

// A path as one shell word: as it is when it has only safe characters, in single quotes otherwise.
function shellQuoted(path: string): string {
  return /^[\w@%+=:,./-]+$/.test(path) ? path : `'${path.replaceAll("'", "'\\''")}'`;
}
