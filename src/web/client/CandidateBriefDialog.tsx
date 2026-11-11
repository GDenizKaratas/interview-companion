import { useEffect, useRef, useState } from "react";
import { api, type BriefEvidence, type Candidate, type CandidateBrief, type Interview } from "./api.ts";
import { CopyBriefCommand } from "./CopyBriefCommand.tsx";
import { interviewName } from "./interview-names.ts";
import { fill, type Text } from "./languages.ts";
import { inlineParts, parseMarkdown, type MarkdownBlock } from "./markdown.ts";
import { useText } from "./text.tsx";

type Load = { state: "loading" } | { state: "ready"; brief: CandidateBrief | null } | { state: "failed" };

// The Candidate Brief an AI client saved, opened large from the Workspace bar. It is read when
// the dialog opens, so its quotes are checked against the sources as they are now. Escape, the
// close button, or a click outside closes it.
export function CandidateBriefDialog({
  candidate,
  interviews,
  onClose,
}: {
  candidate: Candidate;
  interviews: Interview[];
  onClose: () => void;
}) {
  const { text, languageCode } = useText();
  const t = text.brief;
  const dialog = useRef<HTMLDialogElement>(null);
  const [load, setLoad] = useState<Load>({ state: "loading" });

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  useEffect(() => {
    api.getCandidateBrief(candidate.id).then(
      (brief) => setLoad({ state: "ready", brief }),
      () => setLoad({ state: "failed" }),
    );
  }, [candidate.id]);

  const savedAt = (iso: string) =>
    new Intl.DateTimeFormat(languageCode, { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));

  return (
    <dialog
      ref={dialog}
      className="cv-preview-dialog brief-dialog"
      aria-labelledby="brief-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      // A click on the dialog itself, not on its content, is a click on the dimmed page around it.
      onClick={(event) => event.target === dialog.current && onClose()}
    >
      <header className="panel-head">
        <h2 id="brief-title">
          {candidate.name}
          <span className="role">{t.title}</span>
        </h2>
        {/* The command that makes an AI client write and save this brief. */}
        <CopyBriefCommand candidateName={candidate.name} />
        <button type="button" className="icon-button" aria-label={t.close} title={t.close} onClick={onClose}>
          ×
        </button>
      </header>
      <div className="panel-body">
        {load.state === "loading" && <p>{text.workspace.loading}</p>}
        {load.state === "failed" && <p className="error">{t.loadFailed}</p>}
        {load.state === "ready" && load.brief === null && (
          <div className="brief-empty">
            <p>{t.none}</p>
            <p className="hint">{t.noneHint}</p>
          </div>
        )}
        {load.state === "ready" && load.brief !== null && (
          <article className="brief">
            <p className="brief-meta">
              <span className="source-tag">{t.fromAiClient}</span> {fill(t.savedAt, { date: savedAt(load.brief.savedAt) })}
            </p>
            <p className="brief-warning">{t.notChecked}</p>
            <div className="brief-text">
              {parseMarkdown(load.brief.text).map((block, i) => (
                <Block key={i} block={block} />
              ))}
            </div>
            <BriefEvidenceList evidence={load.brief.evidence} interviews={interviews} text={text} />
          </article>
        )}
      </div>
    </dialog>
  );
}

function Block({ block }: { block: MarkdownBlock }) {
  if (block.kind === "heading") {
    const Heading = (["h3", "h4", "h5", "h6"] as const)[block.level - 1]!;
    return (
      <Heading>
        <Inline line={block.text} />
      </Heading>
    );
  }
  if (block.kind === "list") {
    const List = block.ordered ? "ol" : "ul";
    return (
      <List>
        {block.items.map((item, i) => (
          <li key={i}>
            <Inline line={item} />
          </li>
        ))}
      </List>
    );
  }
  return (
    <p>
      {block.lines.map((line, i) => (
        <span key={i}>
          {i > 0 && <br />}
          <Inline line={line} />
        </span>
      ))}
    </p>
  );
}

function Inline({ line }: { line: string }) {
  return inlineParts(line).map((part, i) => (part.bold ? <strong key={i}>{part.text}</strong> : <span key={i}>{part.text}</span>));
}

// The Evidence the brief cites, as the app checked it just now: each quote with where it is from,
// and whether it is still there word for word.
function BriefEvidenceList({ evidence, interviews, text }: { evidence: BriefEvidence[]; interviews: Interview[]; text: Text }) {
  const t = text.brief;
  if (evidence.length === 0) return <p className="hint">{t.noEvidence}</p>;
  const notFound = evidence.filter((e) => !e.found).length;
  return (
    <section className="brief-evidence">
      <h3>{t.evidenceTitle}</h3>
      <p className={notFound > 0 ? "brief-warning" : "hint"}>
        {notFound > 0 ? fill(t.someNotFound, { count: String(notFound), total: String(evidence.length) }) : t.allFound}
      </p>
      <ol>
        {evidence.map((e) => (
          <li key={e.number} value={e.number} className={e.found ? "found" : "not-found"}>
            <span className={e.found ? "evidence-state found" : "evidence-state not-found"}>
              {e.found ? t.found : t.notFound}
            </span>{" "}
            <q>{e.quote}</q> <span className="hint">({sourceName(text, e, interviews)})</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function sourceName(text: Text, evidence: BriefEvidence, interviews: Interview[]): string {
  const t = text.brief;
  if (evidence.source === "cv") return fill(t.cvPage, { page: String(evidence.page) });
  const interview = interviews.find((i) => i.id === evidence.interviewId);
  if (!interview) return fill(t.unknownInterview, { segment: String(evidence.segmentNumber) });
  return fill(t.segment, { interview: interviewName(text, interview), segment: String(evidence.segmentNumber) });
}
