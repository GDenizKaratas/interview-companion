import { useEffect, useState, type ReactNode } from "react";
import { AiCard } from "./AiCard.tsx";
import { CandidateBriefDialog } from "./CandidateBriefDialog.tsx";
import { api, ApiError, type Candidate, type EvidenceResult, type Interview } from "./api.ts";
import { ConfirmDialog } from "./ConfirmDialog.tsx";
import { CvPanel } from "./CvPanel.tsx";
import type { CvFocus } from "./evidence-focus.ts";
import { EvidenceSearch } from "./EvidenceSearch.tsx";
import { collapsePanels, ExpandableCard } from "./ExpandableCard.tsx";
import { ExportCandidateDialog } from "./ExportCandidateDialog.tsx";
import { InterviewSelector } from "./InterviewSelector.tsx";
import { MoreMenu } from "./MoreMenu.tsx";
import { NotesPanel } from "./NotesPanel.tsx";
import { linkTo, listPath, navigate } from "./navigation.ts";
import { SavedQuestions } from "./SavedQuestions.tsx";
import { TranscriptPanel, type SegmentHighlight } from "./TranscriptPanel.tsx";
import { useText } from "./text.tsx";

type Load =
  | { state: "loading" }
  | { state: "ready"; candidate: Candidate }
  | { state: "notFound" }
  | { state: "failed" };

type SourcesTab = "cv" | "transcript";

export function Workspace({ candidateId }: { candidateId: string }) {
  const { text } = useText();
  const [load, setLoad] = useState<Load>({ state: "loading" });
  // The selected Interview's id, or null for all Interviews. The panels show only its content.
  // It is decided when the page has loaded: core says which Interview the Workspace opens on.
  const [interviewId, setInterviewId] = useState<string | null>(null);
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [interviewsFailed, setInterviewsFailed] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleteFailed, setDeleteFailed] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [briefOpen, setBriefOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  // Which source the Sources card shows. A quote or a search result switches it.
  const [sourcesTab, setSourcesTab] = useState<SourcesTab>("cv");
  // Counts changes to the selected Interview's Transcript, so the AI Notes panel loads again.
  const [transcriptVersion, setTranscriptVersion] = useState(0);
  // Changes whenever Asked Questions are found, so the Saved Questions show where they were asked.
  const [askedVersion, setAskedVersion] = useState(0);
  // Counts CV uploads, so the Suggested Questions load again.
  const [cvVersion, setCvVersion] = useState(0);
  // Counts deleted Interviews, so search results that may point into one are dropped.
  const [deletedInterviews, setDeletedInterviews] = useState(0);
  // The Transcript segment an AI Note's quote points to. `request` changes on every click, so
  // clicking the same quote again scrolls to it again.
  const [highlight, setHighlight] = useState<SegmentHighlight>();
  // The CV match an Evidence search result points to. `id` changes on every click, too.
  const [cvFocus, setCvFocus] = useState<CvFocus>();

  // Shows a place in a source: the Sources card turns to it, and a card that is full screen
  // closes, so the place is never opened behind it.
  function showSource(tab: SourcesTab) {
    setSourcesTab(tab);
    document.dispatchEvent(new Event(collapsePanels));
  }

  // A Transcript result selects its Interview, since the Transcript shows one Interview, and is
  // shown the same way as an AI Note's quote, with the matched words marked.
  function openEvidence(result: EvidenceResult) {
    if (result.source === "cv") {
      // The CV panel marks the match in the page's whole text, not only in the excerpt.
      const highlights = result.highlights.map(({ start, end }) => ({
        start: result.excerptStart + start,
        end: result.excerptStart + end,
      }));
      setCvFocus((current) => ({ id: (current?.id ?? 0) + 1, page: result.page, highlights }));
      showSource("cv");
    } else {
      setInterviewId(result.interviewId);
      setHighlight((current) => ({
        interviewId: result.interviewId,
        segmentNumber: result.segmentNumber,
        request: (current?.request ?? 0) + 1,
        marks: result.highlights,
      }));
      showSource("transcript");
    }
  }

  // Shows one segment in the Transcript, selecting its Interview, as an AI Note's quote or an
  // Asked Question does.
  function showInTranscript(segmentInterviewId: string, segmentNumber: number) {
    setInterviewId(segmentInterviewId);
    setHighlight((current) => ({ interviewId: segmentInterviewId, segmentNumber, request: (current?.request ?? 0) + 1 }));
    showSource("transcript");
  }

  function loadInterviews(id: string): Promise<void> {
    return api.listInterviews(id).then(
      (list) => {
        setInterviews(list);
        setInterviewsFailed(false);
      },
      () => setInterviewsFailed(true),
    );
  }

  // Adding an Interview can change the numbers of the others, and core decides them, so the
  // list is fetched again before the new Interview is selected. If that fails, the new one is
  // still shown and selected, next to the load error.
  async function handleInterviewAdded(added: Interview) {
    await loadInterviews(candidateId);
    setInterviews((current) => (current.some((i) => i.id === added.id) ? current : [...current, added]));
    setInterviewId(added.id);
  }

  // What belonged to the deleted Interview is gone: its Transcript, the AI work made from it,
  // and any quote pointing into it. The page goes to the Interview core now names as the default.
  async function handleInterviewDeleted() {
    setHighlight(undefined);
    setDeletedInterviews((count) => count + 1);
    // The new list and the new selection are set together, so no card ever sees the deleted id
    // as selected without its Interview in the list.
    try {
      const [list, next] = await Promise.all([api.listInterviews(candidateId), api.getDefaultInterview(candidateId)]);
      setInterviews(list);
      setInterviewsFailed(false);
      setInterviewId(next?.id ?? null);
    } catch {
      setInterviewsFailed(true);
      setInterviewId(null);
    }
    setTranscriptVersion((version) => version + 1);
  }

  // After the Candidate is deleted there is nothing left to show, so the app goes back to the list.
  // A 404 means the Candidate is already gone, for example deleted in another tab, so it counts
  // as deleted too.
  async function confirmDelete() {
    setConfirmingDelete(false);
    setDeleteFailed(false);
    setDeleting(true);
    try {
      await api.deleteCandidate(candidateId);
      navigate(listPath());
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        navigate(listPath());
      } else {
        setDeleteFailed(true);
        setDeleting(false);
      }
    }
  }

  // The page shows nothing of the Candidate until core has said who they are and which Interview
  // to open on, so no panel first loads "all Interviews" and then loads again.
  useEffect(() => {
    let current = true;
    Promise.all([api.getCandidateOverview(candidateId), api.getDefaultInterview(candidateId)]).then(
      ([overview, defaultInterview]) => {
        if (!current) return;
        setInterviews(overview.interviews);
        setInterviewId(defaultInterview?.id ?? null);
        // After an Interview, its Transcript is what is read; before one, the CV.
        const opened = overview.interviews.find((interview) => interview.id === defaultInterview?.id);
        setSourcesTab(opened?.transcript ? "transcript" : "cv");
        setLoad({ state: "ready", candidate: overview.candidate });
      },
      (error) => current && setLoad({ state: error instanceof ApiError && error.status === 404 ? "notFound" : "failed" }),
    );
    return () => {
      current = false;
    };
  }, [candidateId]);

  // The Candidate list's Questions shortcut opens the page at #questions: the question box takes focus.
  const ready = load.state === "ready";
  useEffect(() => {
    if (!ready || window.location.hash !== "#questions") return;
    const card = document.querySelector<HTMLElement>(".panel-questions");
    card?.scrollIntoView({ block: "nearest" });
    card?.querySelector<HTMLElement>("textarea")?.focus();
  }, [ready]);

  return (
    <main className="workspace">
      {/* One row: who, which Interview, the search, the brief, and the rare actions in a menu. */}
      <header className="workspace-bar">
        <a className="icon-button back-link" href={listPath()} onClick={linkTo(listPath())} aria-label={text.workspace.back} title={text.workspace.back}>
          <BackIcon />
        </a>
        {load.state === "ready" && (
          <h1 title={`${load.candidate.name} · ${load.candidate.role}`}>
            {load.candidate.name} <span className="role">{load.candidate.role}</span>
          </h1>
        )}
        {load.state === "ready" && (
          <InterviewSelector
            interviews={interviews}
            loadError={interviewsFailed}
            candidateId={candidateId}
            selected={interviewId}
            onSelect={setInterviewId}
            onAdded={handleInterviewAdded}
            onRescheduled={() => void loadInterviews(candidateId)}
            onDeleted={() => void handleInterviewDeleted()}
          />
        )}
        {load.state === "ready" && (
          <EvidenceSearch candidateId={candidateId} interviews={interviews} resetKey={deletedInterviews} onOpen={openEvidence} />
        )}
        {load.state === "ready" && (
          <button type="button" className="secondary brief-button" title={text.workspace.openBriefHint} onClick={() => setBriefOpen(true)}>
            {text.workspace.openBrief}
          </button>
        )}
        {load.state === "ready" && (
          <MoreMenu
            label={text.workspace.more}
            items={[
              { label: text.workspace.exportCandidate, onChoose: () => setExportOpen(true) },
              { label: text.workspace.deleteCandidate, danger: true, onChoose: () => !deleting && setConfirmingDelete(true) },
            ]}
          />
        )}
      </header>
      {briefOpen && load.state === "ready" && (
        <CandidateBriefDialog candidate={load.candidate} interviews={interviews} onClose={() => setBriefOpen(false)} />
      )}
      {exportOpen && load.state === "ready" && (
        <ExportCandidateDialog candidate={load.candidate} onClose={() => setExportOpen(false)} />
      )}
      {deleteFailed && <p className="error">{text.workspace.deleteCandidateFailed}</p>}
      {confirmingDelete && load.state === "ready" && (
        <ConfirmDialog
          title={text.workspace.confirmDeleteCandidate}
          confirmLabel={text.workspace.delete}
          cancelLabel={text.workspace.cancel}
          onConfirm={confirmDelete}
          onCancel={() => setConfirmingDelete(false)}
        >
          <p>
            <strong>{load.candidate.name}</strong> · {load.candidate.role}
          </p>
          <p>{text.workspace.deleteCandidateDetails}</p>
        </ConfirmDialog>
      )}
      {load.state === "loading" && <p>{text.workspace.loading}</p>}
      {load.state === "notFound" && <p className="error">{text.workspace.notFound}</p>}
      {load.state === "failed" && <p className="error">{text.workspace.loadFailed}</p>}
      {load.state === "ready" && (
        <div className="panels">
          {/* The CV and the Transcript share one card. Both stay loaded, so switching keeps the page, the scroll, and a marked quote. */}
          <ExpandableCard
            className="panel panel-sources"
            title={text.panels.sources.title}
            actions={
              <div className="view-choice" role="group" aria-label={text.panels.sources.title}>
                {(["cv", "transcript"] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    aria-pressed={sourcesTab === tab}
                    className={sourcesTab === tab ? "role-choice chosen" : "role-choice"}
                    onClick={() => setSourcesTab(tab)}
                  >
                    {tab === "cv" ? text.panels.cv.title : text.panels.transcript.title}
                  </button>
                ))}
              </div>
            }
          >
            <div className="tab-pane" hidden={sourcesTab !== "cv"}>
              <CvPanel candidateId={load.candidate.id} focus={cvFocus} onChanged={() => setCvVersion((version) => version + 1)} />
            </div>
            <div className="tab-pane" hidden={sourcesTab !== "transcript"}>
              <TranscriptPanel
                interviews={interviews}
                selectedInterviewId={interviewId}
                highlight={highlight}
                onChanged={() => {
                  setTranscriptVersion((version) => version + 1);
                  // A replaced Transcript has different segments, so an old highlight would point to the wrong one.
                  setHighlight(undefined);
                }}
              />
            </div>
          </ExpandableCard>
          <Panel area="questions" title={text.panels.questions.title}>
            <SavedQuestions
              candidateId={load.candidate.id}
              role={load.candidate.role}
              interviews={interviews}
              selectedInterviewId={interviewId}
              onShowAll={() => setInterviewId(null)}
              sourceVersion={transcriptVersion + cvVersion}
              askedVersion={askedVersion + transcriptVersion}
              onShowInTranscript={showInTranscript}
            />
          </Panel>
          <Panel area="notes" title={text.panels.interviewerNotes.title}>
            <NotesPanel
              candidateId={candidateId}
              interviews={interviews}
              selectedInterviewId={interviewId}
              onShowAll={() => setInterviewId(null)}
            />
          </Panel>
          <Panel area="ai" title={text.panels.ai.title} label={text.panels.ai.label}>
            <AiCard
              interviews={interviews}
              selectedInterviewId={interviewId}
              transcriptVersion={transcriptVersion}
              onShowEvidence={showInTranscript}
              onFound={() => setAskedVersion((version) => version + 1)}
              onGoToTranscript={() => showSource("transcript")}
            />
          </Panel>
        </div>
      )}
    </main>
  );
}

// A panel of the Workspace, with the full-screen button every card has.
function Panel({ area, title, label, children }: { area: string; title: string; label?: string; children: ReactNode }) {
  return (
    <ExpandableCard className={`panel panel-${area}`} title={title} label={label}>
      {children}
    </ExpandableCard>
  );
}

function BackIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M9.5 3.5 5 8l4.5 4.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
