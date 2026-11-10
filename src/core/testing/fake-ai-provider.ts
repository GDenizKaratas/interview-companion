import type { AiNoteRequest, AiProvider, AiProviderFactory, ProposedAiNote } from "../index.ts";

// A stand-in for the model in tests. It answers with whatever the test sets in `answer`, or
// fails when `answer` is an Error, and records every request and the key it was made with,
// so a test can check what would have been sent and that no call happened.
export interface FakeAiProvider {
  factory: AiProviderFactory;
  answer: ProposedAiNote[] | Error;
  requests: AiNoteRequest[];
  apiKeys: string[];
}

export function fakeAiProvider(answer: ProposedAiNote[] | Error = []): FakeAiProvider {
  const fake: FakeAiProvider = {
    answer,
    requests: [],
    apiKeys: [],
    factory: (apiKey) => {
      const provider: AiProvider = {
        async proposeAiNotes(request) {
          fake.apiKeys.push(apiKey);
          fake.requests.push(request);
          if (fake.answer instanceof Error) throw fake.answer;
          return fake.answer;
        },
      };
      return provider;
    },
  };
  return fake;
}
