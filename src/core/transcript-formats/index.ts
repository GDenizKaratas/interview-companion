import type { TranscriptAdapter } from "./adapter.ts";
import { plainTextAdapter } from "./plain-text.ts";

export type { ParsedSegment, TranscriptAdapter } from "./adapter.ts";

// Every Transcript format the app can import. A new format is a new adapter added here.
export const transcriptAdapters: TranscriptAdapter[] = [plainTextAdapter];

// The adapter for a file, chosen by the ending of its name, or undefined when no adapter reads it.
export function adapterFor(fileName: string): TranscriptAdapter | undefined {
  const name = fileName.toLowerCase();
  return transcriptAdapters.find((adapter) => adapter.extensions.some((extension) => name.endsWith(extension)));
}
