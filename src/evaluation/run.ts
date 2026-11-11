import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { claudeModel, claudeProvider } from "../core/index.ts";
import { renderReport, runEvaluation } from "./evaluate.ts";
import { scenarios } from "./scenarios.ts";

// Runs the real-model evaluation and writes its report to docs/evaluation/. Started by hand with
// `npm run evaluate`; it calls the paid API once per scenario. The key comes from the
// ANTHROPIC_API_KEY environment variable, never from the app's database.

const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
if (!apiKey) {
  console.error("Set ANTHROPIC_API_KEY to run the evaluation, for example: ANTHROPIC_API_KEY=... npm run evaluate");
  process.exit(1);
}

console.log(`Running ${scenarios.length} scenarios against ${claudeModel}. This calls the paid API.`);
const results = await runEvaluation(scenarios, claudeProvider, apiKey);
// A run where nothing reached the model has nothing to report, so no page of zeros is written.
if (results.every((r) => r.error !== null)) {
  console.error(`Every scenario failed, so no report was written. First error: ${results[0]?.error}`);
  process.exit(1);
}

const now = new Date();
const pad = (n: number) => String(n).padStart(2, "0");
const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
const folder = fileURLToPath(new URL("../../docs/evaluation/", import.meta.url));
mkdirSync(folder, { recursive: true });
let path = `${folder}${date}-${claudeModel}.md`;
for (let n = 2; existsSync(path); n++) path = `${folder}${date}-${claudeModel}-${n}.md`;
writeFileSync(path, renderReport(scenarios, results, { date, model: claudeModel }));

for (const r of results) {
  const status = r.error === null ? `saved ${r.saved.length}, dropped ${r.dropped.length}, watch hits ${r.watchHits.length}` : `failed: ${r.error}`;
  console.log(`${r.scenarioId}: ${status}`);
}
console.log(`Report written to ${path}`);
