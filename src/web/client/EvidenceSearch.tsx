import { useState, type FormEvent } from "react";
import { api, ApiError, type EvidenceResult, type EvidenceSearch as SearchResult, type EvidenceSources, type Interview } from "./api.ts";
import { interviewName } from "./interview-names.ts";
import { fill } from "./languages.ts";
import { MarkedText } from "./MarkedText.tsx";
import { useText } from "./text.tsx";
import { formatTime } from "./transcript-text.ts";

// One search over the Candidate's CV and Transcripts. Each result shows the exact excerpt and
// where it is; clicking it opens that place in the CV or Transcript panel.
export function EvidenceSearch({
  candidateId,
  interviews,
  onOpen,
}: {
  candidateId: string;
  interviews: Interview[];
  onOpen: (result: EvidenceResult) => void;
}) {
  const { text } = useText();
  const t = text.search;
  const [query, setQuery] = useState("");
  const [sources, setSources] = useState<EvidenceSources>("all");
  const [candidateOnly, setCandidateOnly] = useState(false);
  const [searching, setSearching] = useState(false);
  const [search, setSearch] = useState<SearchResult | undefined>();
  const [error, setError] = useState<string | undefined>();

  async function runSearch(options = { sources, candidateOnly }) {
    setSearching(true);
    setError(undefined);
    try {
      setSearch(await api.searchEvidence(candidateId, query, options.sources, options.candidateOnly));
    } catch (failure) {
      setSearch(undefined);
      setError(failure instanceof ApiError && failure.rule === "required" ? t.required : t.failed);
    } finally {
      setSearching(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void runSearch();
  }

  // Changing what to search runs the shown search again, so its results never mismatch the choices.
  function changeOptions(options: { sources: EvidenceSources; candidateOnly: boolean }) {
    setSources(options.sources);
    setCandidateOnly(options.candidateOnly);
    if (search) void runSearch(options);
  }

  function nameOf(interviewId: string): string {
    const interview = interviews.find((i) => i.id === interviewId);
    return interview ? interviewName(text, interview) : "";
  }

  // "CV · page 2", or "First interview · 18:42 · Ayşe (Interviewer)".
  function placeOf(result: EvidenceResult): string {
    if (result.source === "cv") return `${t.cv} · ${fill(t.page, { page: String(result.page) })}`;
    const time = result.startMs === null ? text.panels.transcript.noTime : formatTime(result.startMs);
    const role = result.speakerRole ? ` (${text.panels.transcript.speakers.roles[result.speakerRole]})` : "";
    return `${nameOf(result.interviewId)} · ${time} · ${result.speakerLabel}${role}`;
  }

  function clear() {
    setQuery("");
    setSearch(undefined);
    setError(undefined);
  }

  return (
    <section className="evidence-search" aria-label={t.label}>
      <form className="evidence-search-form" onSubmit={submit}>
        <input
          type="search"
          value={query}
          placeholder={t.placeholder}
          aria-label={t.label}
          onChange={(event) => setQuery(event.target.value)}
        />
        <select aria-label={t.sourcesLabel} value={sources} onChange={(event) => changeOptions({ sources: event.target.value as EvidenceSources, candidateOnly })}>
          <option value="all">{t.sources.all}</option>
          <option value="cv">{t.sources.cv}</option>
          <option value="transcripts">{t.sources.transcripts}</option>
        </select>
        <label className="evidence-candidate-only" title={t.candidateOnlyHint}>
          <input type="checkbox" checked={candidateOnly} onChange={(event) => changeOptions({ sources, candidateOnly: event.target.checked })} />
          {t.candidateOnly}
        </label>
        <button type="submit" disabled={searching}>
          {searching ? t.searching : t.submit}
        </button>
        {(search || error) && (
          <button type="button" className="quiet" onClick={clear}>
            {t.clear}
          </button>
        )}
      </form>
      {error && <p className="error">{error}</p>}
      {search && (
        <div className="evidence-results">
          {search.results.length === 0 ? (
            <p className="empty">
              {t.nothingFound} <span className="hint">{t.nothingFoundDetail}</span>
            </p>
          ) : (
            <p className="evidence-summary">
              <strong>
                {fill(t.foundIn, {
                  places: [...(search.foundIn.cv ? [t.cv] : []), ...search.foundIn.interviewIds.map(nameOf)].join(" · "),
                })}
              </strong>
              <span className="hint">
                {search.results.length === 1 ? t.countOne : fill(t.count, { count: String(search.results.length) })}
              </span>
            </p>
          )}
          {search.unconfirmedInterviewIds.length > 0 && (
            <p className="hint">{fill(t.unconfirmed, { interviews: search.unconfirmedInterviewIds.map(nameOf).join(", ") })}</p>
          )}
          {search.results.length > 0 && (
            <ol className="evidence-list">
              {search.results.map((result) => (
                <li key={result.source === "cv" ? `cv-${result.page}-${result.excerptStart}` : `${result.interviewId}-${result.segmentNumber}`}>
                  <button type="button" className="evidence-result" onClick={() => onOpen(result)}>
                    <span className="evidence-place">{placeOf(result)}</span>
                    <span className="evidence-excerpt">
                      <MarkedText text={result.excerpt} highlights={result.highlights} />
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </section>
  );
}
