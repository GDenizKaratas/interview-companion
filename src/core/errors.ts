// Thrown when input breaks a rule of core. The message is safe to show to the Interviewer.
export class InvalidInputError extends Error {
  readonly field: string;

  constructor(field: string, message: string) {
    super(message);
    this.name = "InvalidInputError";
    this.field = field;
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
