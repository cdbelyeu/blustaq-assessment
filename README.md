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

# create an account, sign in, and call an endpoint with the token
curl -X POST localhost:3000/users -H 'content-type: application/json' \
  -d '{"email":"ada@example.com","displayName":"Ada","password":"correct horse battery"}'
curl -X POST localhost:3000/sessions -H 'content-type: application/json' \
  -d '{"email":"ada@example.com","password":"correct horse battery"}'
curl localhost:3000/me -H 'Authorization: Bearer <token>'
open http://localhost:3000/docs # interactive API docs (Swagger UI)
```

Configuration is by environment variable:

| Variable              | Default    | Purpose                                                             |
| --------------------- | ---------- | ------------------------------------------------------------------- |
| `PORT`                | `3000`     | Port the server listens on.                                         |
| `DATABASE_PATH`       | `notes.db` | SQLite file. Created and migrated on startup; `:memory:` for tests. |
| `SESSION_TTL_MINUTES` | `30`       | How long a session lasts after sign-in. Fixed; never extended.      |
| `LOG_LEVEL`           | `info`     | pino level (`debug`, `info`, `warn`, `error`, `silent`).            |

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

| ID     | Feature                                              | User story                                                                                                                                                                                                                                                                                       |
| ------ | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| MVP-1  | Note CRUD                                            | As a **team member**, I want to create, edit and delete notes, so that I have one place to capture and refine my work.                                                                                                                                                                           |
| MVP-2  | Teams and memberships (seeded, read-only)            | As a **team member**, I want to see which teams I belong to and who is on them, so that I know who can see what I share.                                                                                                                                                                         |
| MVP-3  | Note visibility: `private` or shared with one team   | As a **team member**, I want to keep a note private while I draft it and share it with my team when it's ready, so that I control who sees unfinished work.                                                                                                                                      |
| MVP-4  | Authorization rules                                  | As a **team member**, I want people outside my team to be unable to see our notes or even learn that they exist, so that team work stays inside the team. As a **note owner**, I want to be the only one who can delete or unshare my note, so that a teammate can't remove my work by accident. |
| MVP-5  | Sessions: sign in, expire after 30 minutes, sign out | As a **team member**, I want to sign in with a password and have my access end after 30 minutes or when I sign out, so that a lost laptop doesn't mean permanent access.                                                                                                                         |
| MVP-6  | List notes by scope (mine / team), cursor-paginated  | As a **team member**, I want to browse my notes and my team's notes a page at a time, so that I can find what I need as the collection grows.                                                                                                                                                    |
| MVP-7  | Optimistic concurrency (`version` + `If-Match`)      | As a **team member** editing a shared note, I want to be told when a teammate has saved changes since I opened it, so that I don't silently overwrite their work.                                                                                                                                |
| MVP-8  | Validation and a consistent error shape              | As a **client developer**, I want clear, predictably shaped errors, so that I can handle failures in one place and show users what went wrong.                                                                                                                                                   |
| MVP-9  | Integration tests, health check, README              | As an **operator**, I want automated tests and a health check, so that I can change the service with confidence and know when it's down.                                                                                                                                                         |
| MVP-10 | Self-service accounts (`POST /users`, `/me`)         | As a **team member**, I want to create my own account and manage my profile, so that I can start using the service without waiting for an administrator.                                                                                                                                         |
| MVP-11 | Interactive API docs (`/docs`, `/openapi.json`)      | As a **client developer**, I want interactive API docs where I can send real requests, so that I can learn and test the API without writing code first.                                                                                                                                          |

### MVP delivery plan

Each step is delivered and committed on its own, with tests.

| #   | Endpoint                                     | Delivers                                                                               | Story        |
| --- | -------------------------------------------- | -------------------------------------------------------------------------------------- | ------------ |
| 1   | `GET /health`                                | Project scaffold, tooling, both test layers                                            | MVP-9        |
| 2   | `POST /users`, `GET/PATCH/DELETE /me`        | Users table, self-service registration with a password                                 | MVP-10       |
| 2b  | `GET /docs`, `GET /openapi.json`             | OpenAPI document built from the Zod schemas, Swagger UI to try requests                | MVP-11       |
| 3   | `POST /sessions`, `DELETE /sessions/current` | Passwords (scrypt), 30-minute sessions, bearer-token auth; replaces the temporary stub | MVP-5        |
| 4   | `POST /notes`                                | Notes table, create a private note                                                     | MVP-1        |
| 5   | `GET /notes/:id`                             | Read a note                                                                            | MVP-1        |
| 6   | `GET /notes`                                 | List my notes, cursor-paginated                                                        | MVP-6        |
| 7   | `PATCH /notes/:id`                           | Update title and body, guarded by `If-Match`                                           | MVP-1, MVP-7 |
| 8   | `DELETE /notes/:id`                          | Owner deletes a note, guarded by `If-Match`                                            | MVP-1, MVP-4 |
| 9   | `GET /teams`, `GET /teams/:id/members`       | Teams and memberships, seeded                                                          | MVP-2        |
| 10  | `PUT /notes/:id/sharing`                     | Owner shares or unshares; team members can read and edit                               | MVP-3, MVP-4 |
| 11  | `GET /notes?scope=mine\|team`                | Scope filter: my notes, or notes shared with my teams                                  | MVP-6        |

Sharing gets its own endpoint rather than a field on `PATCH`, so the authorization rules map one-to-one to endpoints: team members edit content, and only the owner decides who can see it.

### M2: useful day to day

| Feature                            | User story                                                                                                               |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Full-text search                   | As a **team member**, I want to search notes by keyword, so that I can find a note without remembering where it lives.   |
| Tags and tag filtering             | As a **team member**, I want to tag notes and filter by tag, so that I can group related notes across topics.            |
| Soft delete with trash and restore | As a **team member**, I want to restore a note I deleted by mistake, so that one wrong click doesn't lose work.          |
| Team roles (viewer vs. editor)     | As a **team lead**, I want to give some members read-only access, so that stakeholders can follow along without editing. |
| Change password                    | As a **team member**, I want to change my password, so that a leaked password doesn't mean a lost account.               |
| Session list and revoke            | As a **team member**, I want to see and end my other sessions, so that a lost laptop can't keep access.                  |
| Personal access tokens             | As a **client developer**, I want named, revocable tokens, so that scripts and CI can call the API without a login.      |
| Large notes (paged content)        | As a **team member**, I want to keep notes longer than 100 KB, so that long documents don't have to be split by hand.    |

### M3: ready for production

| Feature                                    | User story                                                                                                                                      |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Revision history                           | As a **team member**, I want to see earlier versions of a note and who changed it, so that I can recover content and understand how it evolved. |
| Sharing with individuals or multiple teams | As a **team member**, I want to share a note with a specific person or another team, so that I can collaborate across team boundaries.          |
| Team management API                        | As a **team lead**, I want to add and remove members, so that access matches who is actually on the team.                                       |
| Real authentication (OIDC/SSO)             | As an **operator**, I want users to sign in with company SSO, so that access ends automatically when someone leaves.                            |
| Social sign-in (Google, Facebook, Apple)   | As a **team member**, I want to sign in with my Google, Facebook or Apple account, so that I don't need another password.                       |
| Audit log                                  | As an **operator**, I want a record of who viewed or changed notes, so that I can investigate incidents.                                        |
| Rate limiting                              | As an **operator**, I want per-client request limits, so that one misbehaving client can't degrade the service for everyone.                    |

### Technical next steps

| Item                                           | Why                                                                                                                                                                                                       |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CI pipeline                                    | Run `yarn verify` (lint, type-check, tests with coverage) on every push and merge request, so the quality gates block bad changes instead of relying on local discipline.                                 |
| Deployment environment                         | A hosted environment with managed secrets, a persistent volume or managed database, and automated deploys from the main branch.                                                                           |
| Multi-stage Dockerfile                         | Lets reviewers and deployments run the service without matching the local Node and Corepack setup. A multi-stage build compiles the native SQLite module without shipping build tools in the final image. |
| Run on Node's native TypeScript type stripping | Drops the `tsx` and `tsc` build step. The code already avoids TypeScript-only runtime features (`erasableSyntaxOnly`), so the switch is mostly configuration.                                             |
| Expired session cleanup                        | Expired sessions are ignored but never deleted, so the table grows. Add a scheduled purge (or delete on sign-in).                                                                                         |

### Out of scope

- **Real-time collaborative editing (CRDT/OT):** a different architecture (WebSockets, merge algorithms). Optimistic concurrency covers the small-team case.
- **File attachments:** needs object storage and upload handling that don't exercise the core sharing problem.
- **Notifications:** depends on delivery channels the service doesn't own.
- **Any frontend:** the deliverable is the API.

## Design choices

My default is the simplest, most conventional solution to a problem. I depart from it only for a strong, specific reason. A product's advantage comes from which features it chooses to build, not from solving ordinary problems in unusual ways. The choices below are the ones where I weighed real alternatives.

### Database: SQLite now, Postgres later

SQLite through better-sqlite3 is the database for this exercise. The data is relational (users, teams, notes, sharing) and the authorization rules are joins, so a relational store fits. SQLite is the cheapest one to run:

- **Local development and tests need nothing installed.** The server creates and migrates a file on startup. Tests run the same migrations against an in-memory database, so the test suite exercises real SQL and nothing is mocked.
- **The path to Postgres is short.** All SQL lives in the repository modules under `src/db`, and the schema lives in numbered `.sql` migrations. Moving means rewriting the dialect differences (placeholders, timestamp types), swapping the driver and migration runner, and making the repository functions async. Routes, validation and authorization don't change.

The cost is a single writer at a time, which is fine for small teams on one instance and is the first thing to outgrow (see [Tradeoffs](#tradeoffs-and-known-limitations)).

If note bodies grow large or heavily read, the next step is to split them out of `notes` into their own table keyed by note ID, or into a document store. Lists, sharing checks and joins would then run over small rows only. The body is already the last column and is never returned by list endpoints, so the code is shaped for that split. Sharding is out of scope; a single database is the right size for this problem.

### Validation: Zod as the single source of truth

Request bodies and query strings arrive as `unknown`, and TypeScript types disappear at runtime. Hand-written checks, hand-written types and hand-written API docs would be three copies of every rule, and they would drift apart. Instead each rule is written once, as a Zod schema in `src/routes/schemas.ts`:

- The schema validates the request at runtime and rejects unknown fields (`strictObject`), so a client can't smuggle in `ownerId` or `version`.
- The TypeScript type of the parsed value is inferred from the same schema, so handlers receive trusted, typed input.
- The OpenAPI request bodies in `/docs` are generated from the same schemas.
- Normalization (lowercased emails, trimmed titles, `limit` coerced to a number with a default) lives in the schema, so no route can forget it.
- Every failure becomes the same `{ error: { code, message, details } }` response.

The cost is that validation runs at runtime only, and refinements such as the 100 KB byte cap don't appear in the generated OpenAPI beyond their description.

## Tradeoffs and known limitations

Choices made deliberately for the scope of this exercise, and what they cost.

**Storage**

- SQLite allows one writer at a time, which is fine for small teams on a single instance. All SQL lives in the repository modules under `src/db`, so moving to Postgres changes those modules and the migration runner, not the routes.
- Deleting a user deletes their notes, including notes they shared with a team. Teammates lose those notes.
- A note body is capped at 100 KB (UTF-8 bytes). That bounds what one request can store and keeps reads and lists small, at the cost of very long documents. Raising it safely means serving a note's content in pages, which is listed under M2.
- Lists are ordered by last edit, newest first, and paged with a cursor on `(updated_at, id)`. A note edited while someone is paging moves to the top and can be missed in that pass, in exchange for a cheap query that never skips or repeats notes that did not change.
- Edits are guarded by `If-Match` with the note's version as a strong ETag. A stale edit gets `412` and nothing is overwritten, but there is no merge: the client must fetch the note again and reapply its change. `If-Match` is required, so a client that skips it gets `428`; `*` and lists of ETags are not supported.
- Deleting a note is permanent, and like editing it needs the note's current `If-Match`, so a client cannot delete work it has not seen. Recovery depends on soft delete with trash and restore, listed under M2.
- Expired sessions are ignored but never deleted, so the `sessions` table only grows. A scheduled purge is listed under technical next steps.

**Authentication**

- Passwords are hashed with scrypt at OWASP's recommended cost. Session tokens are 256 random bits stored as a SHA-256 hash; a fast hash is safe there because there is nothing to guess. A keyed hash (HMAC) would be a possible hardening step.
- Sessions last a fixed 30 minutes and are never extended, so clients sign in again with the password. A sliding idle timeout would be friendlier but turns every authenticated read into a write, which matters with SQLite's single writer.
- There is no password reset, no password change and no check against breached-password lists. A forgotten password means a lost account until email delivery and SSO exist.
- There is no login throttling, so passwords can be guessed at the speed of the server. Rate limiting is an M3 item.
- Sign-in answers an unknown email and a wrong password identically, in status, body and timing. Registration still returns `409` for a taken email, which reveals that the address is registered.
- The service speaks plain HTTP and must run behind TLS, or tokens can be read off the network. If request logging is added, the `Authorization` header must be redacted.

**Code and tooling**

- `EmailTakenError` extends `ApiError`, so the repository carries an HTTP status. It is a pragmatic shortcut; a stricter boundary would throw a plain domain error and map it in the error handler.
- The project compiles to CommonJS and tests transform TypeScript with `@swc/jest`, which does not type-check; `yarn typecheck` does. TypeScript is pinned to 6.0 because typescript-eslint does not support 7.0 yet.
- The OpenAPI document is checked for validity, for documented operations being routed, and for examples matching real responses. A route that exists but is missing from the docs is not detected and has to be caught in review.
- The black-box acceptance suite cannot control the server's clock, so session expiry is tested in the integration suite with an injected clock, not end to end.

## With more time

**Add**

- **Teams, sharing and the team scope** (delivery steps 9–11). This is the part of the MVP not yet built, and it is next because it is what makes the service shared. Until it lands, a note is visible only to its owner.
- **CI, a Dockerfile and a deployment environment**, so `yarn verify` runs on every push. See [Technical next steps](#technical-next-steps).
- **Login throttling and rate limiting**, before the service faces the internet. Passwords can currently be guessed at the speed of the server.
- **Expired session cleanup**, and then the M2 features that matter most day to day: search, tags and soft delete with restore.

**Change**

- **Move to Postgres** once there is more than one instance or heavy concurrent writing, as described under [Database](#database-sqlite-now-postgres-later).
- **Stricter error boundary.** `EmailTakenError` extends `ApiError`, so the repository carries an HTTP status. A plain domain error mapped in the error handler would keep the layers separate.
- **Catch routes missing from the OpenAPI document.** Tests check that documented operations are routed, but not the reverse, so that currently relies on review.

**Stop doing**

- **Keeping the roadmap in the README.** It stands in for a tracker here, and it drifts from the code as steps land. On a real project it belongs in a ticketing tool.
- **Leaving CI until the end.** The quality gates exist locally, but a pipeline should be the first commit so that they block changes from the start.

## Commit history

Each delivery step is its own commit, oldest first. Messages start with `New:` for features and `Chore:` for tooling, structure and docs. The full history is on the repository's commits page; this is a snapshot.

- `1f8e497` New: initial project setup with healthcheck endpoint
- `48bd609` New: added database stub with health check
- `cd126fc` Chore: added constitution file to track constitutional things
- `eba7596` Chore: some test structure changes
- `3e02001` New: centralized logging into a pino-based logger
- `1fbd170` Chore: updated docs
- `6159d51` New: initial implementation of user endpoints - no auth yet
- `8ea4283` Chore: added a note
- `c634be8` Chore: added swagger docs to facilitate testing
- `d52292c` New: implemented user session management
- `c1020f5` Chore: updated docs
- `673d678` New: refactored sql statements for better readabilityh
- `e1c20fc` Chore: docs and planning around handling large notes
- `edfbfd9` Chore: docs for note deletion future steps
- `791193f` New: initial note creation implementation
- `2424f2e` New: note get endpoints
- `282de96` New: note update endpoints
- `9b79f30` New: note deletion
- `4f674ee` Chore: updated readme with design discussion
