# Constitution

The decisions and standards for this project, kept in one place. Change this file when a decision changes.

## Tech stack

| Area            | Choice                                                 | Notes                                                                        |
| --------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------- |
| Language        | TypeScript 6.0, strict                                 | Pinned below 6.1 until typescript-eslint supports TypeScript 7.              |
| Runtime         | Node 24                                                | Pinned in `.nvmrc` and `engines`.                                            |
| Framework       | Express 5                                              | Async handler errors reach the error middleware without wrappers.            |
| Storage         | SQLite via better-sqlite3                              | One writer at a time; fine for small teams. Raw SQL, no ORM.                 |
| Migrations      | Numbered `.sql` files in `src/db/migrations`           | Applied once each, in order, at startup. One migration per change.           |
| Logging         | pino, structured JSON                                  | Configured only in `src/logger.ts`. Level from `LOG_LEVEL` (default `info`). |
| Authentication  | Opaque bearer sessions, scrypt passwords               | Fixed lifetime from `SESSION_TTL_MINUTES` (default 30). No refresh.          |
| API docs        | OpenAPI 3.1 in `src/openapi.ts`, Swagger UI at `/docs` | Request bodies come from the Zod schemas.                                    |
| Validation      | Zod                                                    | Schemas are the single source for runtime checks and types. Strict schemas.  |
| Package manager | Yarn 4 via Corepack, `node-modules` linker             | Never npm. Commit `yarn.lock`.                                               |
| Dev and build   | `tsx watch` for dev, `tsc` to `dist/` for production   | `erasableSyntaxOnly` keeps native type stripping an option.                  |
| Unit and integ. | Jest with `@swc/jest`, supertest, CommonJS output      | `@swc/jest` does not type-check; `yarn typecheck` does.                      |
| Acceptance      | Playwright (API only)                                  | Black box over HTTP against a real server.                                   |
| Lint and format | ESLint 10 (type-checked rules) and Prettier            | Prettier on defaults apart from single quotes and 100 columns.               |

## Data conventions

- IDs are UUIDs, so they cannot be guessed or counted.
- Timestamps are ISO 8601 text in UTC.
- A note's body is a `TEXT` column placed last in the table. List endpoints never return it.
- Deleting a user deletes their notes (`ON DELETE CASCADE` on the note owner). This includes notes they shared with a team.
- A write that changes nothing is not a change: no new `version` and no new `updatedAt`. The version check (`WHERE ... AND version = ?`) and the version increase are in the same SQL statement as the change, so a stale edit can never overwrite newer work.
- Editing a note requires `If-Match` carrying its strong ETag, `"<version>"`. Missing is `428`, malformed is `400`, stale is `412`. ETags on notes are set explicitly, never left to Express's automatic weak ETags. Checks run in this order: access (`404`), body (`400`), header, version (`412`).
- Lists are cursor-paginated with a keyset on `(updated_at, id)`: fetch one extra row to know whether a next page exists, return an opaque cursor, and never include the note body. A bad cursor or limit is a `400`.
- Index every foreign key column; SQLite does not do it for you. The list query's index order (`owner_id, updated_at DESC, id DESC`) matches its sort, and a test checks the query plan.
- `notes.owner_id` is nullable, reserved for team ownership. Nothing creates an ownerless note and no one can read one, because access is "the owner".
- SQL statements are `UPPER_SNAKE` template-literal constants at the top of the file that uses them, never inline strings. Put each clause (`SELECT`, `FROM`, `WHERE`, `SET`) on its own line.
- The schema grows one migration at a time as features need it. No tables ahead of their feature.

## Architecture

- Routes handle HTTP only. SQL lives in a repository module under `src/db`, so a database change touches one place.
- `createApp({ db })` builds the app without listening. `server.ts` is the only file that starts a listener.
- Errors that map to an HTTP response extend `ApiError` (`src/errors.ts`); the error handler turns them, and Zod validation failures, into the response. Request bodies are validated with strict Zod schemas in `src/routes/schemas.ts`, which also normalize input (for example lowercasing emails).
- Authentication: passwords are hashed with scrypt at OWASP's cost, stored with their parameters. Session tokens are 256-bit random values and only a SHA-256 hash is stored. Sessions have a fixed lifetime, are never extended, and expired rows are ignored rather than deleted. Sign-in returns the same `401` for an unknown email and a wrong password. Routes only read `req.user`.
- Every error uses one shape: `{ "error": { "code", "message" } }`. Unknown failures return a generic 500 with no internals.
- Log through the injected `Logger`, never `console.*` (ESLint enforces it in `src/`). Pass errors as `{ err }` so they serialize with a stack. Never log secrets or note content.
- Keep exports minimal. Don't code defensively for cases that cannot happen.

## Quality standards

- `yarn verify` is the gate: type-check, lint (zero warnings), format check, and tests with coverage. It must pass before a step is done.
- Coverage threshold is 90% on lines, branches, functions and statements, owned by Jest. Falling below fails the run.
- Integration tests (`tests/`) run in-process with a real in-memory SQLite database. Mock only at external boundaries, never our own modules.
- Unit specs sit next to the file they test (`src/db/database.spec.ts`). Specs that drive the whole app through supertest live in `tests/`. Spec files are excluded from coverage and from the production build.
- Test files are named `<subject>.spec.ts`. Write every test with `it()`, never `test()`, and word its name to read as a sentence after "it" (`it('returns a JSON 404 for unknown routes')`). Playwright only exports `test`, so import it as `it`: `import { test as it, expect } from '@playwright/test'`.
- Time and password cost are injected into `createApp` (`clock`, `passwordHasher`), and the clock reaches every repository. Tests move the clock instead of sleeping and use a near-free hash.
- Acceptance tests (`acceptance/`) may only reach the service over HTTP. A lint rule blocks imports from `src/`. Test names carry the user story ID (for example `MVP-9`).
- Every endpoint is added to `src/openapi.ts` in the step that creates it. Tests check that the document is valid, that each documented operation is routed, and that real responses match the documented shapes. They do not detect an endpoint that is routed but missing from the docs, so review for that.
- Comments explain why, not what, and never reference tickets or process.
- Docs stay lean. This file and the README are the only documents.

## Authorization rules

- Someone outside a note's team gets `404`, not `403`, so a note's existence is not revealed.
- Access rules live in `src/policies`. Routes call them and answer any denial with `404 note_not_found`, so a missing note and someone else's note look identical.
- Team members can read and edit a shared note. Only the owner can delete it or change who it is shared with.

## Working agreement

- One delivery step at a time, following the plan in the README. Each step ends with a summary of what was done and the checks run, then stops for review.
- The author reviews and makes every commit. Commit messages start with a semantic prefix: `New:` for features, `Fix:` for bug fixes, `Chore:` for tooling, structure and docs (for example `New: added database stub with health check`).
- Docker, CI and a deployment environment are documented as next steps in the README, not built yet.
