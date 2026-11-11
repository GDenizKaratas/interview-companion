import type { DatabaseSync } from "node:sqlite";
import type { ProposedQuestionEvidence } from "./ai-provider.ts";
import { requireAiClientWrites } from "./ai-settings.ts";
import { requireCandidate } from "./candidates.ts";
import { inTransaction } from "./database.ts";
import { InvalidInputError } from "./errors.ts";
import type { Now } from "./interviewer-notes.ts";
import { containsQuote } from "./quotes.ts";

// The Candidate Brief an AI client wrote and saved through MCP. The app does not write it and
// cannot check its statements; it can only check that each quote the brief cites is still in the
// Candidate's CV or Transcripts, and it does so each time the brief is read.

export interface NewCandidateBrief {
  // The brief, as Markdown.
  text: string;
  evidence: NewBriefEvidence[];
}

// One numbered Evidence reference of the brief: the [n] in its text, and the exact quote with
// where it is from, in the same shape as a Suggested Question's Evidence.
export type NewBriefEvidence = ProposedQuestionEvidence & { number: number };

// found is true when the quote is, word for word, in that CV page or Transcript segment of this
// Candidate as they are now.
export type BriefEvidence = NewBriefEvidence & { found: boolean };

export interface CandidateBrief {
  candidateId: string;
  text: string;
  savedAt: string;
  evidence: BriefEvidence[];
}

// Saves the brief, replacing the Candidate's earlier one. Refused while the Interviewer has not
// allowed saving from the AI client.
export function saveCandidateBriefFromClient(
  db: DatabaseSync,
  now: Now,
  candidateId: string,
  brief: NewCandidateBrief,
): CandidateBrief {
  requireAiClientWrites(db);
  return saveCandidateBrief(db, now, candidateId, brief);
}

// Saves the brief, replacing the Candidate's earlier one, without checking the AI client switch.
// Also used for an imported Candidate.
export function saveCandidateBrief(db: DatabaseSync, now: Now, candidateId: string, brief: NewCandidateBrief): CandidateBrief {
  requireCandidate(db, candidateId);
  const text = brief.text.trim();
  if (text === "") throw new InvalidInputError("text", "required", "A Candidate Brief needs text.");
  const numbers = new Set(brief.evidence.map((evidence) => evidence.number));
  if (numbers.size !== brief.evidence.length) {
    throw new InvalidInputError("evidence", "format", "Each Evidence number can be used only once.");
  }
  inTransaction(db, () => {
    // The evidence rows go with the brief they belong to.
    db.prepare("DELETE FROM candidate_brief WHERE candidate_id = ?").run(candidateId);
    db.prepare("INSERT INTO candidate_brief (candidate_id, text, saved_at) VALUES (?, ?, ?)").run(
      candidateId,
      text,
      now().toISOString(),
    );
    const insertEvidence = db.prepare(
      `INSERT INTO candidate_brief_evidence (candidate_id, number, cv_page, interview_id, segment_number, quote)
       VALUES (?, ?, ?, ?, ?, ?)`,
    );
    for (const evidence of brief.evidence) {
      if (evidence.source === "cv") {
        insertEvidence.run(candidateId, evidence.number, evidence.page, null, null, evidence.quote);
      } else {
        insertEvidence.run(candidateId, evidence.number, null, evidence.interviewId, evidence.segmentNumber, evidence.quote);
      }
    }
  });
  return getCandidateBrief(db, candidateId)!;
}

// The Candidate's brief with every quote checked against the sources as they are now, or null
// when no brief was saved.
export function getCandidateBrief(db: DatabaseSync, candidateId: string): CandidateBrief | null {
  requireCandidate(db, candidateId);
  const row = db.prepare("SELECT text, saved_at FROM candidate_brief WHERE candidate_id = ?").get(candidateId) as
    | { text: string; saved_at: string }
    | undefined;
  if (!row) return null;
  const rows = db
    .prepare(
      `SELECT number, cv_page, interview_id, segment_number, quote FROM candidate_brief_evidence
       WHERE candidate_id = ? ORDER BY number`,
    )
    .all(candidateId) as unknown as EvidenceRow[];
  // The source text each quote is checked against. Both look only inside this Candidate's own
  // data, so a quote that names another Candidate's Interview is never found.
  const cvPage = db.prepare("SELECT text FROM cv_page WHERE candidate_id = ? AND number = ?");
  const segment = db.prepare(
    `SELECT transcript_segment.text FROM transcript_segment
     JOIN interview ON interview.id = transcript_segment.interview_id
     WHERE interview.candidate_id = ? AND transcript_segment.interview_id = ? AND transcript_segment.number = ?`,
  );
  const evidence = rows.map((e): BriefEvidence => {
    if (e.interview_id === null) {
      const page = cvPage.get(candidateId, e.cv_page) as { text: string } | undefined;
      return { number: e.number, source: "cv", page: e.cv_page!, quote: e.quote, found: containsQuote(page?.text, e.quote) };
    }
    const segmentRow = segment.get(candidateId, e.interview_id, e.segment_number) as { text: string } | undefined;
    return {
      number: e.number,
      source: "transcript",
      interviewId: e.interview_id,
      segmentNumber: e.segment_number!,
      quote: e.quote,
      found: containsQuote(segmentRow?.text, e.quote),
    };
  });
  return { candidateId, text: row.text, savedAt: row.saved_at, evidence };
}

interface EvidenceRow {
  number: number;
  cv_page: number | null;
  interview_id: string | null;
  segment_number: number | null;
  quote: string;
}
