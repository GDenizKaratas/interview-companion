// Free-text labels that are suggested again once used, such as a Candidate's role or an
// Interview's stage. A label that differs from an earlier one only in letter case or spaces
// is the same label, and is saved under the spelling that was written first.

// Removes spaces around the label and turns any run of spaces inside it into one space.
export function tidyLabel(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

// Returns the earlier spelling of label, if an equal one is among the known labels
// (given in the order they were first written); otherwise the label itself.
export function existingSpelling(knownInOrderWritten: string[], label: string): string {
  return knownInOrderWritten.find((known) => isSameLabel(known, label)) ?? label;
}

// Sorts labels alphabetically with English rules, so the order is the same on every computer.
export function sortLabels(labels: string[]): string[] {
  const alphabetical = new Intl.Collator("en", { sensitivity: "accent" });
  return [...labels].sort(alphabetical.compare);
}

// Two labels are the same if they differ only in letter case. Capital I is i in English but
// ı in Turkish, and one label can mix both languages ("SENIOR YAZILIM MÜHENDİSİ"), so the
// comparison goes letter by letter and lets I stand for either. The machine's default
// language is never used, so the result is the same on every computer.
function isSameLabel(a: string, b: string): boolean {
  const left = [...a.normalize("NFC")];
  const right = [...b.normalize("NFC")];
  return left.length === right.length && left.every((letter, i) => sameLetter(letter, right[i]!));
}

function sameLetter(a: string, b: string): boolean {
  const options = lowerCaseOptions(b);
  return lowerCaseOptions(a).some((lower) => options.includes(lower));
}

function lowerCaseOptions(letter: string): string[] {
  if (letter === "I") return ["i", "ı"];
  if (letter === "İ") return ["i"];
  return [letter.toLocaleLowerCase("en")];
}
