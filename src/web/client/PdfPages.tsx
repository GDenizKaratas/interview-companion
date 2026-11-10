import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy, type RenderTask } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { useEffect, useRef, useState } from "react";
import { useText } from "./text.tsx";

GlobalWorkerOptions.workerSrc = workerUrl;

// Draws one page of a PDF at a time, as wide as the panel, with buttons to move between pages.
export function PdfPages({ url }: { url: string }) {
  const { text } = useText();
  const t = text.panels.cv;
  const [document, setDocument] = useState<PDFDocumentProxy | undefined>();
  const [failed, setFailed] = useState(false);
  const [pageNumber, setPageNumber] = useState(1);
  const [width, setWidth] = useState(0);
  const frame = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    // Forms and scripts inside the file are never run; only the pages are drawn.
    const task = getDocument({ url, enableXfa: false });
    task.promise.then(setDocument, () => setFailed(true));
    return () => {
      void task.destroy();
    };
  }, [url]);

  // The page follows the panel's width, so it is drawn again when the panel is resized.
  useEffect(() => {
    const element = frame.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry?.contentRect.width ?? 0)));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!document || !canvas.current || width === 0) return;
    const target = canvas.current;
    let cancelled = false;
    let renderTask: RenderTask | undefined;
    document.getPage(pageNumber).then((page) => {
      if (cancelled) return;
      const scale = width / page.getViewport({ scale: 1 }).width;
      // Drawn at the screen's pixel density, so text stays sharp on high-resolution screens.
      const viewport = page.getViewport({ scale: scale * window.devicePixelRatio });
      target.width = Math.floor(viewport.width);
      target.height = Math.floor(viewport.height);
      target.style.width = `${width}px`;
      renderTask = page.render({ canvas: target, viewport });
      renderTask.promise.catch(() => {});
    }, () => setFailed(true));
    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [document, pageNumber, width]);

  const pageCount = document?.numPages ?? 0;

  return (
    <div className="pdf-pages">
      {failed && <p className="error">{t.viewFailed}</p>}
      {!document && !failed && <p className="empty">{t.reading}</p>}
      {document && pageCount > 1 && (
        <div className="pdf-page-nav">
          <button
            type="button"
            className="quiet"
            aria-label={t.previous}
            disabled={pageNumber <= 1}
            onClick={() => setPageNumber((n) => n - 1)}
          >
            ‹
          </button>
          <span>{t.page.replace("{page}", String(pageNumber)).replace("{count}", String(pageCount))}</span>
          <button
            type="button"
            className="quiet"
            aria-label={t.next}
            disabled={pageNumber >= pageCount}
            onClick={() => setPageNumber((n) => n + 1)}
          >
            ›
          </button>
        </div>
      )}
      <div ref={frame} className="pdf-page-frame">
        <canvas ref={canvas} className="pdf-page" />
      </div>
    </div>
  );
}
