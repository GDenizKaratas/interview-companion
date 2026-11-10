// The rules core can refuse input for.
export type InputRule = "required" | "format" | "readableText" | "encoding" | "content";

// Thrown when input breaks a rule of core. The English message is safe to show to the
// Interviewer; the web interface uses field and rule to show it in the chosen language instead.
export class InvalidInputError extends Error {
  readonly field: string;
  readonly rule: InputRule;

  constructor(field: string, rule: InputRule, message: string) {
    super(message);
    this.name = "InvalidInputError";
    this.field = field;
    this.rule = rule;
  }
}

// Thrown when an operation names something that does not exist, such as an unknown Candidate.
// The message is safe to show to the Interviewer.
export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}

// Why an action cannot run yet, although its input is fine: something the Interviewer must do first.
export type Precondition =
  | "apiKeyMissing"
  | "noTranscript"
  | "speakerMappingNotConfirmed"
  | "transcriptChanged"
  | "noteCorrected"
  | "noteDismissed";

// Thrown when an action is refused because a step must come first, such as confirming the
// Speaker Mapping before AI Notes. The web interface shows the reason in the chosen language.
export class PreconditionError extends Error {
  readonly reason: Precondition;

  constructor(reason: Precondition, message: string) {
    super(message);
    this.name = "PreconditionError";
    this.reason = reason;
  }
}

// Why a model call failed, so the interface can say what to do about it.
export type AiFailure = "apiKeyRefused" | "rateLimited" | "unavailable" | "declined" | "unusableAnswer";

// Thrown when the AI model could not be reached or gave no usable answer. Nothing was changed.
export class AiProviderError extends Error {
  readonly failure: AiFailure;

  constructor(failure: AiFailure, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "AiProviderError";
    this.failure = failure;
  }
}
