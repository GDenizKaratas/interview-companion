import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openCore, type AiProviderFactory, type Core } from "../core/index.ts";
import { makePdf } from "../core/testing/make-pdf.ts";

// The real-model evaluation (#18): a few fictional scenarios, each run through core exactly as the
// app runs it, against a fresh temporary database. It only measures and describes; nothing here
// decides what is saved. Core's own checks do that, and the report shows what they let through.

export interface Scenario {
  id: string;
  title: string;
  task: "aiNotes" | "suggestedQuestions";
  // The interface language, so the language the model is asked to write in.
  language: string;
  // What a reader of the report should look for, in one sentence.
  lookFor: string;
  // "Label: text" lines, read by the plain-text Transcript format.
  transcript: string[];
  // The speaker label that is the Candidate. Every other speaker is an Interviewer.
  candidateLabel: string;
  // Only for Suggested Questions: CV pages as lines of text, Interviewer Notes, and a focus.
  cvPages?: string[][];
  interviewerNotes?: string[];
  focus?: string;
  // Words that should not appear in what is saved, such as the Interviewer's own words or judging
  // words. A hit is a place for a person to read, not a failure by itself.
  watchTerms: string[];
}

export interface EvaluatedItem {
  // An AI Note's statement or a Suggested Question.
  text: string;
  // A Suggested Question's reason; null for an AI Note.
  reason: string | null;
  quotes: string[];
}

export interface ScenarioResult {
  scenarioId: string;
  // How many items the model proposed.
  proposed: number;
  // What passed core's checks and was saved.
  saved: EvaluatedItem[];
  // What the model proposed and core did not save.
  dropped: EvaluatedItem[];
  watchHits: { term: string; text: string }[];
  // The message of a failed call, or null.
  error: string | null;
}

// Runs every scenario in order. A failed scenario is recorded and the next one still runs.
export async function runEvaluation(
  scenarios: Scenario[],
  providerFor: AiProviderFactory,
  apiKey = "evaluation",
): Promise<ScenarioResult[]> {
  const results: ScenarioResult[] = [];
  for (const scenario of scenarios) results.push(await runScenario(scenario, providerFor, apiKey));
  return results;
}

async function runScenario(scenario: Scenario, providerFor: AiProviderFactory, apiKey: string): Promise<ScenarioResult> {
  const proposals: EvaluatedItem[] = [];
  // Keeps a copy of what the model proposed, before core checks it.
  const recording: AiProviderFactory = (key) => {
    const provider = providerFor(key);
    return {
      async proposeAiNotes(request) {
        const notes = await provider.proposeAiNotes(request);
        proposals.push(...notes.map((n) => ({ text: n.statement, reason: null, quotes: n.evidence.map((e) => e.quote) })));
        return notes;
      },
      async proposeQuestions(request) {
        const questions = await provider.proposeQuestions(request);
        proposals.push(...questions.map((q) => ({ text: q.question, reason: q.reason, quotes: q.evidence.map((e) => e.quote) })));
        return questions;
      },
      proposeAskedQuestions: (request) => provider.proposeAskedQuestions(request),
    };
  };

  const dir = mkdtempSync(join(tmpdir(), "interview-companion-evaluation-"));
  const core = openCore(join(dir, "evaluation.sqlite"), { aiProvider: recording });
  try {
    const saved = await generate(core, scenario, apiKey);
    return {
      scenarioId: scenario.id,
      proposed: proposals.length,
      saved,
      dropped: notSaved(proposals, saved),
      watchHits: watchHits(scenario, saved),
      error: null,
    };
  } catch (error) {
    return {
      scenarioId: scenario.id,
      proposed: proposals.length,
      saved: [],
      dropped: proposals,
      watchHits: [],
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    core.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

// Sets up the fictional Candidate as an Interviewer would, then asks for generation.
async function generate(core: Core, scenario: Scenario, apiKey: string): Promise<EvaluatedItem[]> {
  core.setInterfaceLanguage(scenario.language);
  core.saveApiKey(apiKey);
  const candidate = core.createCandidate({ name: "Fictional Candidate", role: "Backend Engineer" });
  const interview = core.addInterview({ candidateId: candidate.id, date: "2026-01-15" });
  const transcript = core.importTranscript(interview.id, {
    fileName: `${scenario.id}.txt`,
    bytes: new TextEncoder().encode(scenario.transcript.join("\n")),
  });
  core.confirmSpeakerMapping(
    interview.id,
    Object.fromEntries(
      transcript.speakers.map((s) => [s.id, s.label === scenario.candidateLabel ? "candidate" : "interviewer"] as const),
    ),
  );
  if (scenario.task === "aiNotes") {
    const generation = await core.generateAiNotes(interview.id);
    return generation.notes.map((n) => ({ text: n.statement, reason: null, quotes: n.evidence.map((e) => e.quote) }));
  }
  if (scenario.cvPages) {
    await core.attachCv(candidate.id, {
      fileName: "cv.pdf",
      bytes: makePdf(scenario.cvPages.map((lines) => lines.map((text) => ({ text, size: 11 })))),
    });
  }
  if (scenario.interviewerNotes?.length) {
    core.addInterviewerNotes({ candidateId: candidate.id, text: scenario.interviewerNotes.join("\n") });
  }
  const generation = await core.generateSuggestedQuestions(candidate.id, { focus: scenario.focus ?? null });
  return generation.suggestions.map((s) => ({ text: s.text, reason: s.reason, quotes: s.evidence.map((e) => e.quote) }));
}

// The proposals with no saved item of the same text. Core saves an item's text as proposed, so
// this is what its checks dropped.
function notSaved(proposals: EvaluatedItem[], saved: EvaluatedItem[]): EvaluatedItem[] {
  const left = saved.map((item) => item.text);
  return proposals.filter((item) => {
    const i = left.indexOf(item.text.trim());
    if (i === -1) return true;
    left.splice(i, 1);
    return false;
  });
}

function watchHits(scenario: Scenario, saved: EvaluatedItem[]): { term: string; text: string }[] {
  const lower = (text: string) => text.toLocaleLowerCase(scenario.language);
  return saved.flatMap((item) =>
    scenario.watchTerms
      .filter((term) => lower(`${item.text} ${item.reason ?? ""}`).includes(lower(term)))
      .map((term) => ({ term, text: item.text })),
  );
}

export interface RunInfo {
  // The day of the run as YYYY-MM-DD.
  date: string;
  model: string;
}

const taskNames: Record<Scenario["task"], string> = { aiNotes: "AI Notes", suggestedQuestions: "Suggested Questions" };

// The results as a Markdown page for docs/evaluation/. Every number in it comes from this run.
export function renderReport(scenarios: Scenario[], results: ScenarioResult[], run: RunInfo): string {
  const byId = new Map(scenarios.map((s) => [s.id, s]));
  const lines = [
    `# Real-model evaluation, ${run.date}`,
    "",
    `Date: ${run.date}`,
    `Model: ${run.model}`,
    "",
    "Run by hand with `npm run evaluate` on the fictional scenarios in `src/evaluation/scenarios.ts`.",
    "These results are not part of the automated tests, which use a fake provider.",
    "One run per scenario: the model's answers vary, so a second run can differ.",
    "",
    "Proposed: items the model proposed. Saved: items that passed core's checks. Dropped: items core did not save.",
    "Watch hits: watched words found in saved items, each a place to read, not a failure by itself.",
    "",
    "| Scenario | Task | Language | Proposed | Saved | Dropped | Watch hits | Failed |",
    "|---|---|---|---|---|---|---|---|",
    ...results.map((r) => {
      const s = byId.get(r.scenarioId)!;
      const row = [r.scenarioId, taskNames[s.task], s.language, r.proposed, r.saved.length, r.dropped.length, r.watchHits.length];
      return `| ${row.join(" | ")} | ${r.error === null ? "" : "failed"} |`;
    }),
  ];
  for (const r of results) {
    const s = byId.get(r.scenarioId)!;
    lines.push("", `## ${r.scenarioId}: ${s.title}`, "", `Look for: ${s.lookFor}`);
    if (r.error !== null) lines.push("", `Failed: ${r.error}`);
    lines.push("", "### Saved", "", ...items(r.saved));
    lines.push("", "### Dropped by core", "", ...items(r.dropped));
    lines.push("", "### Watch hits", "", ...(r.watchHits.length ? r.watchHits.map((h) => `- ${h.term}: ${h.text}`) : ["None."]));
  }
  return lines.join("\n") + "\n";
}

function items(list: EvaluatedItem[]): string[] {
  if (list.length === 0) return ["None."];
  return list.flatMap((item) => [
    `- ${item.text}`,
    ...(item.reason === null ? [] : [`  - Reason: ${item.reason}`]),
    ...item.quotes.map((quote) => `  - "${quote}"`),
  ]);
}
