---
status: accepted
---

# Local, single-user application with one SQLite file

Interview Companion runs on the Interviewer's own machine, has no login, and keeps all data in one SQLite file plus a folder for uploaded CV files. We chose this because the product is for one Interviewer, the data is sensitive, and the project must start with one command. A hosted, multi-user design would need accounts, permissions, and a database server, none of which helps a single Interviewer.

## Considered Options

- **Hosted web app with Postgres**: supports teams, but adds accounts, access control, deployment, and a database server before the first useful feature.
- **Desktop package (Electron)**: feels native, but adds packaging and release work with no gain for the user.

## Consequences

- The only access boundary in the MVP is what the MCP server is allowed to do.
- "Delete this data" means deleting rows and files on one machine, which is easy to explain and verify.
- Multi-user collaboration later would mean a real migration, not a setting.
