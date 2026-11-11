// The small line drawings of the guides' steps, drawn on a 24 by 24 grid with one stroke width,
// so every step box in every guide looks alike. Each is a list of SVG paths.
const page = ["M6.5 3h7.5l4 4v14h-11.5z", "M14 3v4h4"];

export const stepIcons = {
  addPerson: ["M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z", "M2.5 20c.6-3.4 3.2-5.5 6.5-5.5 1.6 0 3 .5 4.1 1.3", "M18 13v6M15 16h6"],
  page: [...page, "M9.5 12h6M9.5 15.5h6"],
  calendar: ["M4 6h16v14H4z", "M4 10h16", "M8 3.5v4M16 3.5v4", "M8 14h3"],
  pageUp: [...page, "M12 17.5v-6M9.5 13.5l2.5-2.5 2.5 2.5"],
  pageDown: [...page, "M12 11v6M9.5 15l2.5 2.5 2.5-2.5"],
  people: ["M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6z", "M2.5 19c.5-3 2.6-4.8 5.5-4.8s5 1.8 5.5 4.8", "M16.5 10.5a2.5 2.5 0 1 0 0-5", "M17 14.3c2.3.4 3.9 2 4.5 4.7"],
  checkList: ["M4 7l1.8 1.8L9 5.5", "M4 13.5l1.8 1.8L9 12", "M12 7.5h8M12 14h8M4.5 19.5h15.5"],
  speech: ["M4 4.5h16v11.5h-9l-4.5 3.5v-3.5H4z", "M8 8.5h8M8 12h5"],
  cloud: ["M7.5 18.5h9.5a3.5 3.5 0 0 0 .4-7A5 5 0 0 0 7.8 10a4.25 4.25 0 0 0-.3 8.5z", "M12 15.5v-4M10 13l2-2 2 2"],
  camera: ["M3.5 7h11v10h-11z", "M14.5 10.5l6-3v9l-6-3z"],
  laptop: ["M5 5.5h14v10H5z", "M2.5 18.5h19", "M8 9h8M8 12h5"],
  nameTag: ["M8.5 11a3.25 3.25 0 1 0 0-6.5 3.25 3.25 0 0 0 0 6.5z", "M2.5 19.5c.6-3.2 3-5.2 6-5.2", "M13.5 13.5h5l2.5 3-2.5 3h-5z"],
  link: ["M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1", "M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1"],
} satisfies Record<string, string[]>;
