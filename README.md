# Team Notes API

A REST backend for a note-taking service used and shared among several small teams.

## Getting started

Requires Node 24 (see `.nvmrc`) and Corepack, which ships with Node 24 and pins Yarn 4.

```sh
nvm use            # or install Node 24 another way
corepack enable    # once per machine
yarn install
yarn dev           # http://localhost:3000, reloads on change
curl localhost:3000/health      # process is up
curl localhost:3000/health/db   # database is reachable and migrated
```

Configuration is by environment variable:

| Variable        | Default    | Purpose                                                             |
| --------------- | ---------- | ------------------------------------------------------------------- |
| `PORT`          | `3000`     | Port the server listens on.                                         |
| `DATABASE_PATH` | `notes.db` | SQLite file. Created and migrated on startup; `:memory:` for tests. |
| `LOG_LEVEL`     | `info`     | pino level (`debug`, `info`, `warn`, `error`, `silent`).            |

| Script                     | What it does                                                                  |
| -------------------------- | ----------------------------------------------------------------------------- |
| `yarn dev`                 | Run from source with reload (`tsx watch`).                                    |
| `yarn build && yarn start` | Compile to `dist/` and run the compiled server.                               |
| `yarn verify`              | Type-check, lint, format check and tests with coverage. Fails on any problem. |
| `yarn test`                | Unit and integration tests (Jest, in-process). Coverage threshold: 90%.       |
| `yarn test:acceptance`     | Black-box acceptance tests (Playwright) against a real running server.        |

### Testing approach

There are three kinds of test with different jobs:

- **Unit specs** sit next to the file they test (for example `src/db/database.spec.ts`).
- **Integration specs** (`tests/`) drive the whole app in-process through supertest against a real in-memory database. They cover edge cases and error paths. Jest owns the coverage gate for both of these.
- **Acceptance tests** (`acceptance/`) treat the service as a black box. Playwright builds and starts the real server, then talks to it over HTTP only; a lint rule blocks imports from `src/`. Each test is named for the user story it verifies (for example `MVP-9`). Set `BASE_URL` to run the same suite against an already running server or another environment. Playwright was chosen so the suite can be handed to QA and later extended with UI tests.

## Context and constraints

The guidance for this assessment conflicted. The kickoff meeting described a 3–6 hour exercise with AI assistance allowed. The TestGorilla platform said it would be completed in the browser within a hard 3-hour limit, with no external tools or AI. I followed the meeting guidance: the project was built locally with AI assistance (Claude Code), within roughly that time budget.

Because of that, the supporting infrastructure a real project would have from day one (repository hosting, CI/CD pipelines, a deployment environment) wasn't set up beforehand and was out of reach within the time available. Those items are documented below under [Technical next steps](#technical-next-steps) rather than left out silently. The quality gates themselves (lint, type-check, tests with a coverage threshold) do exist and run locally through a single `yarn verify` script, ready for CI to call.

## Scope and roadmap

This section stands in for a project management tool, which is where the roadmap would live on a real project. The MVP is built to show the core problem done correctly: notes that are shared within a team, with sound authorization and safe concurrent edits. Later milestones add convenience features and production hardening.

### Audience

| Persona              | Who they are                                                                            |
| -------------------- | --------------------------------------------------------------------------------------- |
| **Team member**      | The primary user. Captures notes, keeps some private and shares others with their team. |
| **Team lead**        | A team member who also manages who is on the team and what they can do.                 |
| **Client developer** | Builds the web or mobile app on top of this API. The API's direct consumer.             |
| **Operator**         | Runs and maintains the service.                                                         |

### MVP

| ID    | Feature                                             | User story                                                                                                                                                                                                                                                                                       |
| ----- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| MVP-1 | Note CRUD                                           | As a **team member**, I want to create, edit and delete notes, so that I have one place to capture and refine my work.                                                                                                                                                                           |
| MVP-2 | Users, teams and memberships (seeded, read-only)    | As a **team member**, I want to see which teams I belong to and who is on them, so that I know who can see what I share.                                                                                                                                                                         |
| MVP-3 | Note visibility: `private` or shared with one team  | As a **team member**, I want to keep a note private while I draft it and share it with my team when it's ready, so that I control who sees unfinished work.                                                                                                                                      |
| MVP-4 | Authorization rules                                 | As a **team member**, I want people outside my team to be unable to see our notes or even learn that they exist, so that team work stays inside the team. As a **note owner**, I want to be the only one who can delete or unshare my note, so that a teammate can't remove my work by accident. |
| MVP-5 | Bearer-token auth (seeded tokens)                   | As a **client developer**, I want every request to be tied to a known user, so that the service can enforce who can do what.                                                                                                                                                                     |
| MVP-6 | List notes by scope (mine / team), cursor-paginated | As a **team member**, I want to browse my notes and my team's notes a page at a time, so that I can find what I need as the collection grows.                                                                                                                                                    |
| MVP-7 | Optimistic concurrency (`version` + `If-Match`)     | As a **team member** editing a shared note, I want to be told when a teammate has saved changes since I opened it, so that I don't silently overwrite their work.                                                                                                                                |
| MVP-8 | Validation and a consistent error shape             | As a **client developer**, I want clear, predictably shaped errors, so that I can handle failures in one place and show users what went wrong.                                                                                                                                                   |
| MVP-9 | Integration tests, health check, README             | As an **operator**, I want automated tests and a health check, so that I can change the service with confidence and know when it's down.                                                                                                                                                         |

### MVP delivery plan

Each step is delivered and committed on its own, with tests.

| #   | Endpoint                               | Delivers                                                      | Story        |
| --- | -------------------------------------- | ------------------------------------------------------------- | ------------ |
| 1   | `GET /health`                          | Project scaffold, tooling, both test layers                   | MVP-9        |
| 2   | `GET /me`                              | Users table, auth middleware stub that attaches a seeded user | MVP-5        |
| 3   | `POST /notes`                          | Notes table, create a private note                            | MVP-1        |
| 4   | `GET /notes/:id`                       | Read a note                                                   | MVP-1        |
| 5   | `GET /notes`                           | List my notes                                                 | MVP-6        |
| 6   | `PATCH /notes/:id`                     | Update title and body                                         | MVP-1        |
| 7   | `DELETE /notes/:id`                    | Owner deletes a note                                          | MVP-1, MVP-4 |
| 8   | (no new endpoint)                      | Real bearer-token auth replaces the stub                      | MVP-5        |
| 9   | `GET /teams`, `GET /teams/:id/members` | Teams and memberships, seeded                                 | MVP-2        |
| 10  | `PUT /notes/:id/sharing`               | Owner shares or unshares; team members can read and edit      | MVP-3, MVP-4 |
| 11  | `GET /notes?scope=mine\|team&cursor=`  | Scope filter and cursor pagination                            | MVP-6        |
| 12  | `If-Match` on `PATCH /notes/:id`       | Optimistic concurrency, `412` on conflict                     | MVP-7        |

Sharing gets its own endpoint rather than a field on `PATCH`, so the authorization rules map one-to-one to endpoints: team members edit content, and only the owner decides who can see it.

### M2: useful day to day

| Feature                            | User story                                                                                                                |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Full-text search                   | As a **team member**, I want to search notes by keyword, so that I can find a note without remembering where it lives.    |
| Tags and tag filtering             | As a **team member**, I want to tag notes and filter by tag, so that I can group related notes across topics.             |
| Soft delete with trash and restore | As a **team member**, I want to restore a note I deleted by mistake, so that one wrong click doesn't lose work.           |
| Team roles (viewer vs. editor)     | As a **team lead**, I want to give some members read-only access, so that stakeholders can follow along without editing.  |
| OpenAPI/Swagger docs               | As a **client developer**, I want machine-readable API docs, so that I can explore endpoints and generate a typed client. |

### M3: ready for production

| Feature                                    | User story                                                                                                                                      |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Revision history                           | As a **team member**, I want to see earlier versions of a note and who changed it, so that I can recover content and understand how it evolved. |
| Sharing with individuals or multiple teams | As a **team member**, I want to share a note with a specific person or another team, so that I can collaborate across team boundaries.          |
| Team management API                        | As a **team lead**, I want to add and remove members, so that access matches who is actually on the team.                                       |
| Real authentication (OIDC/SSO)             | As an **operator**, I want users to sign in with company SSO, so that access ends automatically when someone leaves.                            |
| Audit log                                  | As an **operator**, I want a record of who viewed or changed notes, so that I can investigate incidents.                                        |
| Rate limiting                              | As an **operator**, I want per-client request limits, so that one misbehaving client can't degrade the service for everyone.                    |

### Technical next steps

| Item                                           | Why                                                                                                                                                                                                       |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CI pipeline                                    | Run `yarn verify` (lint, type-check, tests with coverage) on every push and merge request, so the quality gates block bad changes instead of relying on local discipline.                                 |
| Deployment environment                         | A hosted environment with managed secrets, a persistent volume or managed database, and automated deploys from the main branch.                                                                           |
| Multi-stage Dockerfile                         | Lets reviewers and deployments run the service without matching the local Node and Corepack setup. A multi-stage build compiles the native SQLite module without shipping build tools in the final image. |
| Run on Node's native TypeScript type stripping | Drops the `tsx` and `tsc` build step. The code already avoids TypeScript-only runtime features (`erasableSyntaxOnly`), so the switch is mostly configuration.                                             |

### Out of scope

- **Real-time collaborative editing (CRDT/OT):** a different architecture (WebSockets, merge algorithms). Optimistic concurrency covers the small-team case.
- **File attachments:** needs object storage and upload handling that don't exercise the core sharing problem.
- **Notifications:** depends on delivery channels the service doesn't own.
- **Any frontend:** the deliverable is the API.
