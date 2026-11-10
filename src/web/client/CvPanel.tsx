import { lazy, Suspense, useEffect, useRef, useState, type ChangeEvent } from "react";
import { AddButton } from "./AddButton.tsx";
import { api, type Cv } from "./api.ts";
import { ConfirmDialog } from "./ConfirmDialog.tsx";
import { cvRefusalMessage } from "./cv-refusal.ts";
import type { CvFocus } from "./evidence-focus.ts";
import { useText } from "./text.tsx";

// pdf.js is large, so it is loaded only when a CV is shown.
const PdfPages = lazy(() => import("./PdfPages.tsx").then((module) => ({ default: module.PdfPages })));

// The CV panel: the uploaded PDF page by page, or an upload button when there is none.
export function CvPanel({
  candidateId,
  focus,
  onChanged,
}: {
  candidateId: string;
  // A search result to open and mark in the CV.
  focus?: CvFocus;
  // Called after a CV was uploaded or replaced, since that removes the suggestions quoting the old one.
  onChanged?: () => void;
}) {
  const { text } = useText();
  const t = text.panels.cv;
  // undefined while loading, null when the Candidate has no CV.
  const [cv, setCv] = useState<Cv | null | undefined>();
  const [loadFailed, setLoadFailed] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<unknown>();
  // A file chosen to replace the current CV, waiting for the Interviewer to confirm.
  const [replacement, setReplacement] = useState<File | undefined>();
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.getCv(candidateId).then(setCv, () => setLoadFailed(true));
  }, [candidateId]);

  function handleFileChosen(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Cleared, so choosing the same file again still counts as a choice.
    event.target.value = "";
    if (!file) return;
    if (cv) setReplacement(file);
    else void upload(file);
  }

  async function upload(file: File) {
    setUploading(true);
    setUploadError(undefined);
    try {
      setCv(await api.uploadCv(candidateId, file));
      onChanged?.();
    } catch (error) {
      setUploadError(error);
    } finally {
      setUploading(false);
    }
  }

  const chooseFile = () => fileInput.current?.click();

  return (
    <div className="cv">
      <input ref={fileInput} type="file" accept="application/pdf,.pdf" hidden onChange={handleFileChosen} />
      {loadFailed && <p className="error">{t.loadFailed}</p>}
      {cv === null && !uploading && (
        <div className="cv-empty">
          <p className="empty">{t.empty}</p>
          <AddButton onClick={chooseFile}>{t.upload}</AddButton>
        </div>
      )}
      {uploading && <p className="empty">{t.reading}</p>}
      {uploadError !== undefined && <p className="error">{cvRefusalMessage(text, uploadError)}</p>}
      {cv && (
        <>
          <div className="cv-file">
            <span className="cv-file-name" title={cv.fileName}>
              {cv.fileName}
            </span>
            <button type="button" className="quiet" onClick={chooseFile} disabled={uploading}>
              {t.replace}
            </button>
          </div>
          {/* The upload time is part of the key, so a replaced CV is loaded again. */}
          <Suspense fallback={<p className="empty">{t.reading}</p>}>
            <PdfPages key={cv.uploadedAt} url={api.cvFileUrl(candidateId)} pages={cv.pages} focus={focus} />
          </Suspense>
        </>
      )}
      {replacement && (
        <ConfirmDialog
          title={t.confirmReplace}
          confirmLabel={t.replaceConfirm}
          cancelLabel={t.cancel}
          onCancel={() => setReplacement(undefined)}
          onConfirm={() => {
            setReplacement(undefined);
            void upload(replacement);
          }}
        >
          <p>{t.confirmReplaceDetail.replace("{current}", cv?.fileName ?? "").replace("{new}", replacement.name)}</p>
        </ConfirmDialog>
      )}
    </div>
  );
}
