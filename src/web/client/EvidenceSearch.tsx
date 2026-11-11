import { useEffect, useRef, useState, type FormEvent } from "react";
import { api, ApiError, type EvidenceResult, type EvidenceSearch as SearchResult, type EvidenceSources, type Interview } from "./api.ts";
import { interviewName } from "./interview-names.ts";
import { fill } from "./languages.ts";
import { MarkedText } from "./MarkedText.tsx";
import { useText } from "./text.tsx";
import { formatTime } from "./transcript-text.ts";

// One search over the Candidate's CV and Transcripts: a single field in the Workspace bar, and
// Enter searches. The results open in a panel under the bar, over the Workspace, so they never
// push the panels down; what to search, and whether only the Candidate's words count, is chosen
// there. Each result shows the exact excerpt and where it is; clicking it closes the results and
// opens that place in the CV or Transcript. Focusing the field shows the last results again.
export function EvidenceSearch({
  candidateId,
  interviews,
  resetKey,
  onOpen,
}: {
  candidateId: string;
  interviews: Interview[];
  // Changes when an Interview is deleted: the results may point into it, so they are dropped.
  resetKey: number;
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
  const [open, setOpen] = useState(false);
  const [shownResetKey, setShownResetKey] = useState(resetKey);
  if (shownResetKey !== resetKey) {
    setShownResetKey(resetKey);
    setSearching(false);
    setSearch(undefined);
    setError(undefined);
    setOpen(false);
  }

  // Only the newest search may show its answer: an earlier one that arrives late would not match
  // the options chosen since, or could bring back results a reset has dropped.
  const latestSearch = useRef(0);
  const section = useRef<HTMLElement>(null);

  async function runSearch(options = { sources, candidateOnly }) {
    const thisSearch = ++latestSearch.current;
    setSearching(true);
    setError(undefined);
    setOpen(true);
    try {
      const found = await api.searchEvidence(candidateId, query, options.sources, options.candidateOnly);
      if (thisSearch !== latestSearch.current) return;
      setSearch(found);
    } catch (failure) {
      if (thisSearch !== latestSearch.current) return;
      setSearch(undefined);
      setError(failure instanceof ApiError && failure.rule === "required" ? t.required : t.failed);
    } finally {
      if (thisSearch === latestSearch.current) setSearching(false);
    }
  }

  // A search still on its way when the results are reset belongs to the old state.
  useEffect(() => {
    latestSearch.current++;
  }, [resetKey]);

  // A click anywhere else closes the results; the search itself is kept.
  useEffect(() => {
    if (!open) return;
    function onPointer(event: PointerEvent) {
      if (!section.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [open]);

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
    setOpen(false);
  }

  function openResult(result: EvidenceResult) {
    setOpen(false);
    onOpen(result);
  }

  const resultCount = search ? (search.results.length === 1 ? t.countOne : fill(t.count, { count: String(search.results.length) })) : "";

  return (
    <section
      ref={section}
      className="evidence-search"
      aria-label={t.label}
      onKeyDown={(event) => {
        if (event.key !== "Escape" || !open) return;
        event.stopPropagation();
        setOpen(false);
      }}
    >
      <form className="evidence-search-form" onSubmit={submit}>
        <label className="search-field">
          <SearchIcon />
          <input
            type="search"
            value={query}
            placeholder={t.placeholder}
            aria-label={t.label}
            onChange={(event) => setQuery(event.target.value)}
            onFocus={() => (search || error) && setOpen(true)}
          />
        </label>
        {searching && <span className="hint">{t.searching}</span>}
      </form>
      {(search || error) && open && (
        <div className="evidence-results">
          <div className="evidence-options">
            <div className="view-choice" role="group" aria-label={t.sourcesLabel}>
              {(["all", "cv", "transcripts"] as const).map((key) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={sources === key}
                  className={sources === key ? "role-choice chosen" : "role-choice"}
                  onClick={() => changeOptions({ sources: key, candidateOnly })}
                >
                  {t.sources[key]}
                </button>
              ))}
            </div>
            <label className="evidence-candidate-only">
              <input
                type="checkbox"
                checked={candidateOnly}
                disabled={sources === "cv"}
                onChange={(event) => changeOptions({ sources, candidateOnly: event.target.checked })}
              />
              <span>
                {t.candidateOnly}
                <span className="hint">{t.candidateOnlyHint}</span>
              </span>
            </label>
            <button type="button" className="quiet" onClick={clear}>
              {t.clear}
            </button>
            <button type="button" className="icon-button evidence-close" aria-label={t.closeResults} title={t.closeResults} onClick={() => setOpen(false)}>
              ×
            </button>
          </div>
          {error && <p className="error">{error}</p>}
          {search && search.results.length === 0 && (
            <p className="empty">
              {t.nothingFound} <span className="hint">{t.nothingFoundDetail}</span>
            </p>
          )}
          {search && search.results.length > 0 && (
            <p className="evidence-summary">
              <strong>
                {fill(t.foundIn, {
                  places: [...(search.foundIn.cv ? [t.cv] : []), ...search.foundIn.interviewIds.map(nameOf)].join(" · "),
                })}
              </strong>
              <span className="hint">{resultCount}</span>
            </p>
          )}
          {search && search.unconfirmedInterviewIds.length > 0 && (
            <p className="hint">{fill(t.unconfirmed, { interviews: search.unconfirmedInterviewIds.map(nameOf).join(", ") })}</p>
          )}
          {search && search.results.length > 0 && (
            <ol className="evidence-list">
              {search.results.map((result) => (
                <li key={result.source === "cv" ? `cv-${result.page}-${result.excerptStart}` : `${result.interviewId}-${result.segmentNumber}`}>
                  <button type="button" className="evidence-result" onClick={() => openResult(result)}>
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

function SearchIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="7" cy="7" r="4.25" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M10.2 10.2 14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
