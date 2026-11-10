import { useSyncExternalStore } from "react";

// A minimal router: "/" is the Candidate list, "/candidates/:id" is a Workspace.
export type Page = { name: "candidates" } | { name: "workspace"; candidateId: string };

function subscribe(onChange: () => void) {
  window.addEventListener("popstate", onChange);
  return () => window.removeEventListener("popstate", onChange);
}

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

export function candidatePath(id: string): string {
  return `/candidates/${encodeURIComponent(id)}`;
}
