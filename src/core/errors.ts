// The rules core can refuse input for. The interface uses field and rule to show the
// message in the Interviewer's language; the English message is for logs and the MCP server.
export type InputRule = "required" | "format";

// Thrown when input breaks a rule of core. The message is safe to show to the Interviewer.
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
