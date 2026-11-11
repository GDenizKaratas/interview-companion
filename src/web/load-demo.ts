// `npm run demo`: loads the fictional demo set into the app's database: the demo Candidate and
// ten more Candidates, with past, today's, and Planned Interviews. Running it again replaces the set with
// a fresh copy; other Candidates stay. The app loads only the demo Candidate by itself on its
// first start; this command brings it back later, with the rest of the set.
import { defaultDatabasePath, openCore } from "../core/index.ts";

const core = openCore(defaultDatabasePath());
try {
  const demos = await core.loadDemoCandidates();
  console.log(`Loaded ${demos.length} demo Candidates: ${demos.map((c) => c.name).join(", ")}. Start the app with \`npm start\` to see them.`);
} finally {
  core.close();
}
