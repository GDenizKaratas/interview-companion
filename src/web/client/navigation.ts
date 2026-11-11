import { useSyncExternalStore, type MouseEvent } from "react";

// A minimal router: "/" is the Candidate list, "/candidates/:id" is a Workspace.
export type Page = { name: "candidates" } | { name: "workspace"; candidateId: string };

function subscribe(onChange: () => void) {
  window.addEventListener("popstate", onChange);
  return () => window.removeEventListener("popstate", onChange);
}

// The pathname only: the query of the Candidate list (its role, view, and page) does not change the page.
export function usePath(): string {
  return useSyncExternalStore(subscribe, () => window.location.pathname);
}

export function pageFor(path: string): Page {
  const match = /^\/candidates\/([^/]+)$/.exec(path);
  return match ? { name: "workspace", candidateId: decodeURIComponent(match[1]!) } : { name: "candidates" };
}

export function navigate(path: string): void {
  window.history.pushState(null, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

// A click handler for an in-app link: changes the page without reloading it.
export function linkTo(path: string) {
  return (event: MouseEvent) => {
    event.preventDefault();
    navigate(path);
  };
}

export function candidatePath(id: string): string {
  return `/candidates/${encodeURIComponent(id)}`;
}

// The Candidate list's role, view, and page as last shown, as a query ("?role=…&view=…&page=…")
// or "". Going back to the list from a Workspace, by the browser or by the app's own back link,
// returns to them.
let listQuery = "";

export function listPath(): string {
  return `/${listQuery}`;
}

// Keeps the Candidate list's choices in the address without adding a history entry, so the
// browser's back button leaves the list instead of stepping through each choice.
export function showListQuery(params: URLSearchParams): void {
  const query = params.toString();
  listQuery = query === "" ? "" : `?${query}`;
  if (window.location.pathname === "/" && window.location.search !== listQuery) {
    window.history.replaceState(null, "", listPath());
  }
}

export function readListQuery(): URLSearchParams {
  return new URLSearchParams(window.location.search);
}
