import { CandidateList } from "./CandidateList.tsx";
import { pageFor, usePath } from "./navigation.ts";
import { Workspace } from "./Workspace.tsx";

export function App() {
  const page = pageFor(usePath());
  return page.name === "workspace" ? (
    <Workspace key={page.candidateId} candidateId={page.candidateId} />
  ) : (
    <CandidateList />
  );
}
