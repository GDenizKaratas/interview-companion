// The rules core can refuse input for.
export type InputRule = "required" | "format";

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
// The English message is safe to show to the Interviewer.
export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}
