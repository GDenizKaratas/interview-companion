import type {
  AiNoteRequest,
  AiProvider,
  AiProviderFactory,
  ProposedAiNote,
  ProposedQuestion,
  QuestionRequest,
} from "../index.ts";

// A stand-in for the model in tests. It answers with whatever the test sets in `answer` (AI
// Notes) or `questions` (Suggested Questions), or fails when that is an Error, and records every
// request and the key it was made with, so a test can check what would have been sent and that
// no call happened.
export interface FakeAiProvider {
  factory: AiProviderFactory;
  answer: ProposedAiNote[] | Error;
  questions: ProposedQuestion[] | Error;
  requests: AiNoteRequest[];
  questionRequests: QuestionRequest[];
  apiKeys: string[];
}

export function fakeAiProvider(answer: ProposedAiNote[] | Error = []): FakeAiProvider {
  const fake: FakeAiProvider = {
    answer,
    questions: [],
    requests: [],
    questionRequests: [],
    apiKeys: [],
    factory: (apiKey) => {
      const provider: AiProvider = {
        async proposeAiNotes(request) {
          fake.apiKeys.push(apiKey);
          fake.requests.push(request);
          if (fake.answer instanceof Error) throw fake.answer;
          return fake.answer;
        },
        async proposeQuestions(request) {
          fake.apiKeys.push(apiKey);
          fake.questionRequests.push(request);
          if (fake.questions instanceof Error) throw fake.questions;
          return fake.questions;
        },
      };
      return provider;
    },
  };
  return fake;
}
