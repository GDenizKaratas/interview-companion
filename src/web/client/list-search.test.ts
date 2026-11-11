import { describe, expect, it } from "vitest";
import { matchesSearch } from "./list-search.ts";

describe("The Candidate list's search", () => {
  it("ignores letter case and the dotted and dotless i, both ways", () => {
    expect(matchesSearch("elif", ["ELİF YILMAZ"])).toBe(true);
    expect(matchesSearch("ivan", ["IVAN PETROV"])).toBe(true);
    expect(matchesSearch("aydin", ["Deniz Aydın"])).toBe(true);
    expect(matchesSearch("AYDIN", ["Deniz Aydın"])).toBe(true);
    expect(matchesSearch("ılker", ["İlker Şahin"])).toBe(true);
  });

  it("finds a part of the name or of the role, and finds everyone for an empty search", () => {
    expect(matchesSearch("  şah ", ["İlker Şahin"])).toBe(true);
    expect(matchesSearch("backend", ["Ada Kaya", "Senior Backend Developer"])).toBe(true);
    expect(matchesSearch("", ["Ada Kaya"])).toBe(true);
  });

  it("does not ignore other Turkish letters", () => {
    expect(matchesSearch("sahin", ["İlker Şahin"])).toBe(false);
    expect(matchesSearch("ozturk", ["Can Öztürk"])).toBe(false);
  });
});
