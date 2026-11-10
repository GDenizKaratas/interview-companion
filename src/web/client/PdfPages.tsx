import { getDocument, GlobalWorkerOptions, TextLayer, type PDFDocumentProxy, type RenderTask } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { useEffect, useRef, useState } from "react";
import type { CvPage, Highlight } from "./api.ts";
import type { CvFocus } from "./evidence-focus.ts";
import { markedParts } from "./marked-parts.ts";
import { useText } from "./text.tsx";

GlobalWorkerOptions.workerSrc = workerUrl;

// The text pieces pdf.js laid over the drawn page, and the text of each.
interface PageText {
  pageNumber: number;
  pieces: HTMLElement[];
  texts: string[];
}

// Draws one page of a PDF at a time, as wide as the panel, with buttons to move between pages.
// The page's text is laid over it, invisible but selectable, so a search match can be marked.
// pages is the CV's text as core stored it, which says where on the page a match is.
export function PdfPages({ url, pages, focus }: { url: string; pages: CvPage[]; focus?: CvFocus }) {
  const { text } = useText();
  const t = text.panels.cv;
  const [document, setDocument] = useState<PDFDocumentProxy | undefined>();
  const [failed, setFailed] = useState(false);
  const [pageNumber, setPageNumber] = useState(1);
  const [width, setWidth] = useState(0);
  const [pageText, setPageText] = useState<PageText | undefined>();
  const frame = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const textLayer = useRef<HTMLDivElement>(null);
  const scrolledFocusId = useRef<number | undefined>(undefined);

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

  useEffect(() => {
    if (!document || !canvas.current || !textLayer.current || width === 0) return;
    const target = canvas.current;
    const layer = textLayer.current;
    let cancelled = false;
    let renderTask: RenderTask | undefined;
    let pieces: TextLayer | undefined;
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
      pieces = new TextLayer({ textContentSource: page.streamTextContent(), container: layer, viewport: page.getViewport({ scale }) });
      pieces.render().then(() => {
        if (!cancelled) setPageText({ pageNumber, pieces: pieces!.textDivs, texts: pieces!.textContentItemsStr });
      }, () => {});
    }, () => setFailed(true));
    return () => {
      cancelled = true;
      renderTask?.cancel();
      pieces?.cancel();
    };
  }, [document, pageNumber, width]);

  // Marks the opened result on its page, and brings it into view once per click.
  useEffect(() => {
    if (!pageText) return;
    const stored = pages.find((page) => page.number === pageText.pageNumber)?.text;
    const highlights = focus && focus.page === pageText.pageNumber && stored !== undefined ? focus.highlights : [];
    markPieces(pageText, stored ?? "", highlights);
    if (focus && highlights.length > 0 && scrolledFocusId.current !== focus.id) {
      scrolledFocusId.current = focus.id;
      textLayer.current?.querySelector("mark")?.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, [pageText, pages, focus]);

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

// Marks the highlights, given as positions in the page's stored text, on the text pieces.
// Core stored the page as these same pieces' text, with only spaces and line breaks changed, so
// the n-th letter that is not a space is the same letter in both. A match that runs over several
// pieces is marked in each of them.
function markPieces({ pieces, texts }: PageText, stored: string, highlights: Highlight[]) {
  const wanted = highlights.map(({ start, end }) => [lettersBefore(stored, start), lettersBefore(stored, end)] as const);
  let letter = 0;
  texts.forEach((pieceText, i) => {
    const ranges: Highlight[] = [];
    for (let at = 0; at < pieceText.length; at++) {
      if (isSpace(pieceText[at]!)) continue;
      if (wanted.some(([from, to]) => letter >= from && letter < to)) {
        const last = ranges.at(-1);
        // Spaces between marked letters of the same match are marked too.
        if (last && wanted.some(([from, to]) => letter > from && letter < to)) last.end = at + 1;
        else ranges.push({ start: at, end: at + 1 });
      }
      letter++;
    }
    const piece = pieces[i]!;
    if (ranges.length === 0) {
      if (piece.querySelector("mark")) piece.textContent = pieceText;
      return;
    }
    piece.replaceChildren(
      ...markedParts(pieceText, ranges).map((part) => {
        if (!part.marked) return window.document.createTextNode(part.text);
        const mark = window.document.createElement("mark");
        mark.textContent = part.text;
        return mark;
      }),
    );
  });
}

function lettersBefore(text: string, position: number): number {
  let count = 0;
  for (let at = 0; at < position; at++) if (!isSpace(text[at]!)) count++;
  return count;
}

function isSpace(character: string): boolean {
  return /\s/.test(character);
}
