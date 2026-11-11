// The Candidate list's search: whether a Candidate's name or role holds the search text, ignoring
// letter case and the dotted and dotless i (decision 188). "elif" finds "ELİF", "ivan" finds
// "IVAN", and "aydin", typed on an English keyboard, finds "Aydın".
//
// This rule is looser than core's rule for comparing letters (decision 51, turkish-letters.ts),
// where a lowercase ı matches only ı. It is not shared with core on purpose: the browser may import
// only types from core (decision 47), and a quick filter of names should forgive a missing dot.
export function matchesSearch(search: string, values: string[]): boolean {
  const needle = folded(search.trim());
  return needle === "" || values.some((value) => folded(value).includes(needle));
}

function folded(value: string): string {
  return value.toLocaleLowerCase("tr").replaceAll("ı", "i");
}
