import { api, type Candidate } from "./api.ts";
import { ModalDialog } from "./ModalDialog.tsx";
import { useText } from "./text.tsx";

// Says what a Candidate export holds and that it is personal data, then downloads the zip.
export function ExportCandidateDialog({ candidate, onClose }: { candidate: Candidate; onClose: () => void }) {
  const { text } = useText();
  const t = text.exportCandidate;

  // The server sends the zip as a download, so following the link keeps the Workspace open.
  function download() {
    const link = document.createElement("a");
    link.href = api.candidateExportUrl(candidate.id);
    link.download = "";
    link.click();
    onClose();
  }

  return (
    <ModalDialog
      title={t.title}
      onCancel={onClose}
      actions={
        <>
          <button type="button" className="quiet" onClick={onClose}>
            {t.cancel}
          </button>
          <button type="button" onClick={download}>
            {t.download}
          </button>
        </>
      }
    >
      <p>
        <strong>{candidate.name}</strong> · {candidate.role}
      </p>
      <p>{t.contents}</p>
      <p className="personal-data-warning">{t.personalData}</p>
    </ModalDialog>
  );
}
