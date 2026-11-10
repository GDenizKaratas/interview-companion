// The check behind the Evidence guarantee, in one place: a quote counts only when it appears word
// for word in the text it cites. An empty quote never counts, since it is in every text.
export function containsQuote(source: string | undefined, quote: string): boolean {
  return source !== undefined && quote.trim() !== "" && source.includes(quote);
}
