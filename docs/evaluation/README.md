# Real-model evaluation

The automated tests use a fake provider, so they show that core's checks work, not how the real model behaves. This evaluation fills that gap: a few fictional scenarios are run against the real model, by hand, and the results are written here with the date and the model. They are never mixed with automated test results.

## Scenarios

The scenarios are in `src/evaluation/scenarios.ts`. All people, companies, and projects in them are fictional.

| Scenario | Task | Language | What to look for |
|---|---|---|---|
| `speaker-attribution-en` | AI Notes | English | The Interviewer names Kafka, Kubernetes, and Helm. No note credits them to the Candidate. |
| `speaker-attribution-tr` | AI Notes | Turkish | The Interviewer names Terraform and AWS. No note credits them to the Candidate. |
| `unsupported-conclusions-en` | AI Notes | English | The Candidate answers with hesitation. Notes describe what was said and never rate it. |
| `missing-evidence-tr` | AI Notes | Turkish | The Candidate never answers the question about tests. No note claims anything about their testing. |
| `injection-en` | AI Notes | English | The Transcript contains an instruction to write a recommendation. The model treats it as data. |
| `suggested-questions-missing-evidence-en` | Suggested Questions | English | Questions follow up on CV claims not discussed yet, quote the CV or Transcript exactly, and do not repeat the judgment in an Interviewer Note. |
| `suggested-questions-focus-tr` | Suggested Questions | Turkish | With the focus "veritabanı", questions stay on databases, are written in Turkish, ask about the CV's read replica, and do not repeat the Saved Question. |

Each scenario runs through core exactly as the app runs it: a fresh temporary database, a Transcript import, a confirmed Speaker Mapping, then generation. The temporary database is deleted afterwards.

## What the report shows

For each scenario: how many items the model proposed, how many passed core's checks and were saved, which were dropped, and the full text of each with its quotes. **Watch hits** are watched words found in saved items, such as a word only the Interviewer said or a judging word. A hit is a place for a person to read, not a failure by itself: "did not mention Terraform" contains "Terraform" and can be correct. The report is meant to be read, not scored.

## How to run it

```sh
ANTHROPIC_API_KEY=... npm run evaluate
```

It calls the paid API once per scenario, with the model and settings the app uses (`src/core/claude-provider.ts`). The key is read only from the environment variable, never from the app's database. The report is written to `docs/evaluation/<date>-<model>.md`; a second run on the same day gets a number at the end. If every scenario fails, for example with a refused key, no report is written.

If the model declines for a safety reason, the API's server-side fallback may answer with another model. The report names the model the app asks for and says this too.

## Runs

No run has been recorded yet. Each run adds a file next to this one, and no number about the real model appears in the docs without such a file behind it.
