import { getDocument, GlobalWorkerOptions, TextLayer, type PDFDocumentProxy, type RenderTask } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { useEffect, useRef, useState } from "react";
import type { EvidenceFocus } from "./evidence-focus.ts";
import { useText } from "./text.tsx";

GlobalWorkerOptions.workerSrc = workerUrl;

// Draws one page of a PDF at a time, as wide as the panel, with buttons to move between pages.
// The page's text is laid over it, invisible but selectable, so a search match can be marked.
export function PdfPages({ url, focus }: { url: string; focus?: Extract<EvidenceFocus, { source: "cv" }> }) {
  const { text } = useText();
  const t = text.panels.cv;
  const [document, setDocument] = useState<PDFDocumentProxy | undefined>();
  const [failed, setFailed] = useState(false);
  const [pageNumber, setPageNumber] = useState(1);
  const [width, setWidth] = useState(0);
  const frame = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const textLayer = useRef<HTMLDivElement>(null);

  // Opening a search result goes to its page, once per click; the buttons still work after it.
  const [openedFocusId, setOpenedFocusId] = useState<number | undefined>();
  if (focus && focus.id !== openedFocusId) {
    setOpenedFocusId(focus.id);
    setPageNumber(focus.page);
  }

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

  // The words of the opened search result, if it is on the shown page.
  const marks = focus && focus.page === pageNumber ? focus.marks : undefined;

  useEffect(() => {
    if (!document || !canvas.current || !textLayer.current || width === 0) return;
    const target = canvas.current;
    const layer = textLayer.current;
    let cancelled = false;
    let renderTask: RenderTask | undefined;
    let text: TextLayer | undefined;
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
      layer.replaceChildren();
      layer.style.setProperty("--total-scale-factor", String(scale));
      text = new TextLayer({ textContentSource: page.streamTextContent(), container: layer, viewport: page.getViewport({ scale }) });
      text.render().then(() => {
        if (cancelled || !marks) return;
        markWords(text!.textDivs, marks);
        layer.querySelector("mark")?.scrollIntoView({ block: "center", behavior: "smooth" });
      }, () => {});
    }, () => setFailed(true));
    return () => {
      cancelled = true;
      renderTask?.cancel();
      text?.cancel();
    };
  }, [document, pageNumber, width, marks]);

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
        <div ref={textLayer} className="textLayer" />
      </div>
    </div>
  );
}

// Marks every place the given words appear in the page's text pieces. The words are exact text
// from the CV, and the CV's text was read from these same pieces, so an exact match finds them.
function markWords(pieces: HTMLElement[], words: string[]) {
  for (const piece of pieces) {
    const content = piece.textContent ?? "";
    const ranges = words
      .flatMap((word) => [...content.matchAll(new RegExp(escapeRegExp(word), "g"))].map((m) => [m.index, m.index + word.length]))
      .sort((a, b) => a[0]! - b[0]!);
    if (ranges.length === 0) continue;
    const parts: Node[] = [];
    let at = 0;
    for (const [start, end] of ranges as [number, number][]) {
      if (end <= at) continue;
      const from = Math.max(start, at);
      if (from > at) parts.push(window.document.createTextNode(content.slice(at, from)));
      const mark = window.document.createElement("mark");
      mark.textContent = content.slice(from, end);
      parts.push(mark);
      at = end;
    }
    parts.push(window.document.createTextNode(content.slice(at)));
    piece.replaceChildren(...parts);
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
