import { describe, expect, it } from "vitest";
import { AiProviderError } from "../core/index.ts";
import { fakeAiProvider } from "../core/testing/fake-ai-provider.ts";
import { renderReport, runEvaluation, type Scenario } from "./evaluate.ts";
import { scenarios } from "./scenarios.ts";

// Segment 1 is the Interviewer, segment 2 the Candidate.
const attribution: Scenario = {
  id: "attribution",
  title: "Words of the Interviewer",
  task: "aiNotes",
  language: "en",
  lookFor: "No note credits the Interviewer's words to the Candidate.",
  transcript: ["Ayla: Our team runs everything on Kafka.", "Bora: I wrote the billing service in Go."],
  candidateLabel: "Bora",
  watchTerms: ["Kafka"],
};

describe("runEvaluation", () => {
  it("counts what the model proposed, what core saved, and what it dropped, and lists watch terms found", async () => {
    const fake = fakeAiProvider([
      { statement: "Wrote the billing service in Go.", evidence: [{ segmentNumber: 2, quote: "billing service in Go" }] },
      { statement: "Uses Kafka for everything.", evidence: [{ segmentNumber: 1, quote: "runs everything on Kafka" }] },
      { statement: "Knows Kafka from the billing work.", evidence: [{ segmentNumber: 2, quote: "billing service" }] },
    ]);

    const [result] = await runEvaluation([attribution], fake.factory);

    expect(result).toMatchObject({ scenarioId: "attribution", proposed: 3, error: null });
    expect(result!.saved.map((item) => item.text)).toEqual([
      "Wrote the billing service in Go.",
      "Knows Kafka from the billing work.",
    ]);
    expect(result!.dropped.map((item) => item.text)).toEqual(["Uses Kafka for everything."]);
    expect(result!.watchHits).toEqual([{ term: "Kafka", text: "Knows Kafka from the billing work." }]);
  });

  it("records a failed call instead of stopping the other scenarios", async () => {
    const fake = fakeAiProvider(new AiProviderError("unavailable", "The model could not be reached."));

    const results = await runEvaluation([attribution, { ...attribution, id: "second" }], fake.factory);

    expect(results.map((r) => [r.scenarioId, r.error])).toEqual([
      ["attribution", "The model could not be reached."],
      ["second", "The model could not be reached."],
    ]);
  });

  it("sets up every scenario of the evaluation through core without an error", async () => {
    const fake = fakeAiProvider([]);

    const results = await runEvaluation(scenarios, fake.factory);

    expect(results.map((r) => r.error)).toEqual(scenarios.map(() => null));
    expect(fake.requests.length + fake.questionRequests.length).toBe(scenarios.length);
  });

  it("covers speaker attribution, unsupported conclusions, and missing Evidence, in English and Turkish", () => {
    const ids = scenarios.map((s) => s.id);
    expect(ids).toEqual(expect.arrayContaining(["speaker-attribution-en", "unsupported-conclusions-en", "missing-evidence-tr"]));
    expect(new Set(scenarios.map((s) => s.language))).toEqual(new Set(["en", "tr"]));
    expect(new Set(scenarios.map((s) => s.task))).toEqual(new Set(["aiNotes", "suggestedQuestions"]));
  });
});

describe("renderReport", () => {
  it("writes the date, the model, a summary row per scenario, and every saved and dropped item with its quotes", () => {
    const report = renderReport(
      [attribution],
      [
        {
          scenarioId: "attribution",
          proposed: 2,
          saved: [{ text: "Knows Kafka from the billing work.", reason: null, quotes: ["billing service"] }],
          dropped: [{ text: "Uses Kafka for everything.", reason: null, quotes: ["runs everything on Kafka"] }],
          watchHits: [{ term: "Kafka", text: "Knows Kafka from the billing work." }],
          error: null,
        },
      ],
      { date: "2026-11-11", model: "claude-opus-5-5" },
    );

    expect(report).toContain("Date: 2026-11-11");
    expect(report).toContain("Model: claude-opus-5-5");
    expect(report).toContain("not part of the automated tests");
    expect(report).toContain("| attribution | AI Notes | en | 2 | 1 | 1 | 1 |  |");
    expect(report).toContain("No note credits the Interviewer's words to the Candidate.");
    expect(report).toContain('- Knows Kafka from the billing work.\n  - "billing service"');
    expect(report).toContain('- Uses Kafka for everything.\n  - "runs everything on Kafka"');
    expect(report).toContain("- Kafka: Knows Kafka from the billing work.");
  });

  it("shows a failed scenario as failed, with its message", () => {
    const report = renderReport(
      [attribution],
      [{ scenarioId: "attribution", proposed: 0, saved: [], dropped: [], watchHits: [], error: "The model could not be reached." }],
      { date: "2026-11-11", model: "claude-opus-5-5" },
    );

    expect(report).toContain("| attribution | AI Notes | en | 0 | 0 | 0 | 0 | failed |");
    expect(report).toContain("Failed: The model could not be reached.");
  });
});
