import { describe, expect, it } from "vitest";
import { formatTime } from "./transcript-text.ts";

describe("Transcript times", () => {
  it.each([
    [0, "0:00"],
    [4_999, "0:04"],
    [245_000, "4:05"],
    [3_729_000, "1:02:09"],
  ])("shows %i ms as %s", (ms, shown) => {
    expect(formatTime(ms)).toBe(shown);
  });
});
