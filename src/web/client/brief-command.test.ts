import { describe, expect, it } from "vitest";
import { briefCommand } from "./brief-command.ts";

describe("The brief command the Workspace copies", () => {
  it("is the AI client's command for the brief prompt, with the Candidate's name", () => {
    expect(briefCommand("Ada Demir")).toBe("/mcp__interview-companion__brief Ada Demir");
  });

  it("keeps the name on one line, so pasting it does not send it early", () => {
    expect(briefCommand("  Ada \n Demir\t")).toBe("/mcp__interview-companion__brief Ada Demir");
  });
});
