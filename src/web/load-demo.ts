// `npm run demo`: loads the fictional demo Candidate into the app's database.
// Running it again replaces the demo Candidate with a fresh copy; other Candidates stay.
import { defaultDatabasePath, openCore } from "../core/index.ts";

const core = openCore(defaultDatabasePath());
try {
  const demo = core.loadDemoCandidate();
  console.log(`Loaded the demo Candidate: ${demo.name}. Start the app with \`npm start\` to see them.`);
} finally {
  core.close();
}
