import { describe, expect, it } from "vitest";
import { inlineParts, parseMarkdown } from "./markdown.ts";

describe("The Markdown of a Candidate Brief", () => {
  it("is read as headings, lists, and paragraphs", () => {
    const brief = [
      "# Candidate Brief: Ece Yalın",
      "",
      "## From the CV",
      "- Built job queues [1].",
      "* Used **Redis** [2].",
      "",
      "1. Why BullMQ?",
      "2. Which database?",
      "",
      "[1] The statement.",
      "Reason: the excerpt says so.",
      "",
      "#### Small heading",
      "####### Not a heading",
    ].join("\n");

    expect(parseMarkdown(brief)).toEqual([
      { kind: "heading", level: 1, text: "Candidate Brief: Ece Yalın" },
      { kind: "heading", level: 2, text: "From the CV" },
      { kind: "list", ordered: false, items: ["Built job queues [1].", "Used **Redis** [2]."] },
      { kind: "list", ordered: true, items: ["Why BullMQ?", "Which database?"] },
      { kind: "paragraph", lines: ["[1] The statement.", "Reason: the excerpt says so."] },
      { kind: "heading", level: 4, text: "Small heading" },
      { kind: "paragraph", lines: ["####### Not a heading"] },
    ]);
  });

  it("keeps HTML as plain text", () => {
    expect(parseMarkdown('<img src=x onerror="alert(1)">')).toEqual([
      { kind: "paragraph", lines: ['<img src=x onerror="alert(1)">'] },
    ]);
  });

  it("splits a line into plain and bold parts", () => {
    expect(inlineParts("Used **Redis** and **BullMQ**.")).toEqual([
      { bold: false, text: "Used " },
      { bold: true, text: "Redis" },
      { bold: false, text: " and " },
      { bold: true, text: "BullMQ" },
      { bold: false, text: "." },
    ]);
    expect(inlineParts("No ** pair")).toEqual([{ bold: false, text: "No ** pair" }]);
  });
});
