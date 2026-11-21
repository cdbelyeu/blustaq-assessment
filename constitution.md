# Constitution

The decisions and standards for this project, kept in one place. Change this file when a decision changes.

## Tech stack

| Area            | Choice                                               | Notes                                                                                   |
| --------------- | ---------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Language        | TypeScript 6.0, strict                               | Pinned below 6.1 until typescript-eslint supports TypeScript 7.                         |
| Runtime         | Node 24                                              | Pinned in `.nvmrc` and `engines`.                                                       |
| Framework       | Express 5                                            | Async handler errors reach the error middleware without wrappers.                       |
| Storage         | SQLite via better-sqlite3                            | One writer at a time; fine for small teams. Raw SQL, no ORM.                            |
| Migrations      | Numbered `.sql` files in `src/db/migrations`         | Applied once each, in order, at startup. One migration per change.                      |
| Validation      | Zod                                                  | Schemas are the single source for runtime checks and types. Added with the first input. |
| Package manager | Yarn 4 via Corepack, `node-modules` linker           | Never npm. Commit `yarn.lock`.                                                          |
| Dev and build   | `tsx watch` for dev, `tsc` to `dist/` for production | `erasableSyntaxOnly` keeps native type stripping an option.                             |
| Unit and integ. | Jest with `@swc/jest`, supertest, CommonJS output    | `@swc/jest` does not type-check; `yarn typecheck` does.                                 |
| Acceptance      | Playwright (API only)                                | Black box over HTTP against a real server.                                              |
| Lint and format | ESLint 10 (type-checked rules) and Prettier          | Prettier on defaults apart from single quotes and 100 columns.                          |

## Data conventions

- IDs are UUIDs, so they cannot be guessed or counted.
- Timestamps are ISO 8601 text in UTC.
- A note's body is a `TEXT` column placed last in the table. List endpoints never return it.
- The schema grows one migration at a time as features need it. No tables ahead of their feature.

## Architecture

- Routes handle HTTP only. SQL lives in a repository module under `src/db`, so a database change touches one place.
- `createApp({ db })` builds the app without listening. `server.ts` is the only file that starts a listener.
- Every error uses one shape: `{ "error": { "code", "message" } }`. Unknown failures return a generic 500 with no internals.
- Keep exports minimal. Don't code defensively for cases that cannot happen.

## Quality standards

- `yarn verify` is the gate: type-check, lint (zero warnings), format check, and tests with coverage. It must pass before a step is done.
- Coverage threshold is 90% on lines, branches, functions and statements, owned by Jest. Falling below fails the run.
- Integration tests (`tests/`) run in-process with a real in-memory SQLite database. Mock only at external boundaries, never our own modules.
- Acceptance tests (`acceptance/`) may only reach the service over HTTP. A lint rule blocks imports from `src/`. Test names carry the user story ID (for example `MVP-9`).
- Comments explain why, not what, and never reference tickets or process.
- Docs stay lean. This file and the README are the only documents.

## Authorization rules

- Someone outside a note's team gets `404`, not `403`, so a note's existence is not revealed.
- Team members can read and edit a shared note. Only the owner can delete it or change who it is shared with.

## Working agreement

- One delivery step at a time, following the plan in the README. Each step ends with a summary of what was done and the checks run, then stops for review.
- The author reviews and makes every commit. Commit messages use Conventional Commits (`feat:`, `test:`, `chore:`).
- Docker, CI and a deployment environment are documented as next steps in the README, not built yet.
