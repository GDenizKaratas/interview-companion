// How two letters compare when letter case is ignored, for text that can mix Turkish and English.
// Capital I is i in English but ı in Turkish, so it stands for either; capital İ is i. Every other
// letter is lowered without a language, so the result is the same on every computer.

export function sameLetter(a: string, b: string): boolean {
  const options = lowerCaseOptions(b);
  return lowerCaseOptions(a).some((lower) => options.includes(lower));
}

function lowerCaseOptions(letter: string): string[] {
  if (letter === "I") return ["i", "ı"];
  if (letter === "İ") return ["i"];
  return [letter.toLocaleLowerCase("en")];
}
