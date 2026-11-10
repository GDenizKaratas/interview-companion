// English, the default language. Every other translation file has exactly these keys.
// To add a language, copy this file to <language code>.ts (for example de.ts or pt-BR.ts)
// and translate the text. Every .ts file in this folder is loaded as a language, so put
// nothing else here.
const text = {
  appName: "Interview Companion",
  tagline: "Your interviews, all in one place.",
  languageLabel: "Language",
  candidates: {
    title: "Candidates",
    empty: "No Candidates yet. Add the first one above.",
    nameLabel: "Name",
    roleLabel: "Role",
    add: "Add Candidate",
    saveFailed: "The Candidate could not be saved.",
    loadFailed: "Candidates could not be loaded.",
    required: {
      name: "A Candidate needs a name.",
      role: "A Candidate needs a role.",
    },
  },
  workspace: {
    back: "← Candidates",
    loading: "Loading…",
    notFound: "This Candidate does not exist.",
    loadFailed: "The Workspace could not be loaded. Check that the app is still running.",
  },
  panels: {
    cv: { title: "CV", empty: "No CV uploaded." },
    interviewerNotes: { title: "My Notes", empty: "No personal notes yet." },
    transcript: { title: "Transcript", empty: "No transcript available." },
    aiNotes: { title: "AI Notes", label: "AI-generated", empty: "AI Notes have not been generated." },
    questions: { title: "Questions", empty: "No questions saved." },
  },
};

export default { name: "English", text };
