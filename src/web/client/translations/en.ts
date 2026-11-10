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
  interviews: {
    label: "Interview",
    all: "All",
    ordinal: {
      "1": "First Interview",
      "2": "Second Interview",
      "3": "Third Interview",
      "4": "Fourth Interview",
      "5": "Fifth Interview",
      "6": "Sixth Interview",
      "7": "Seventh Interview",
      "8": "Eighth Interview",
      "9": "Ninth Interview",
      "10": "Tenth Interview",
    },
    // Used after the tenth Interview. {number} is replaced by the Interview's number.
    numbered: "Interview {number}",
    noDate: "no date",
    planned: "planned",
    add: "New Interview",
    dateLabel: "Date (optional)",
    save: "Add Interview",
    cancel: "Cancel",
    invalidDate: "The date must be a real day.",
    saveFailed: "The Interview could not be saved.",
    loadFailed: "Interviews could not be loaded.",
  },
  panels: {
    cv: { title: "CV", empty: "No CV uploaded." },
    interviewerNotes: {
      title: "My Notes",
      empty: "No personal notes yet.",
      placeholder: "Write a note, Enter to save…",
      hint: "Each line becomes its own note.",
      tagLabel: "Interview",
      noInterview: "No interview",
      savedAt: "Saved at",
      edit: "Edit",
      cancel: "Cancel",
      delete: "Delete",
      confirmDelete: "Delete this note?",
      required: "A note needs some text.",
      saveFailed: "Note could not be saved.",
      deleteFailed: "Note could not be deleted.",
      loadFailed: "Notes could not be loaded.",
      // {interview} is replaced by the Interview's name.
      hiddenByFilter: "Saved to {interview}. It is not shown while another Interview is selected.",
      showAll: "Show all notes",
    },
    transcript: { title: "Transcript", empty: "No transcript available." },
    aiNotes: { title: "AI Notes", label: "AI-generated", empty: "AI Notes have not been generated." },
    questions: { title: "Questions", empty: "No questions saved." },
  },
};

export default { name: "English", text };
