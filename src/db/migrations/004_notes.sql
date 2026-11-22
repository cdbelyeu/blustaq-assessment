-- owner_id is nullable so team ownership can be added later. Nothing creates an ownerless note,
-- and no one can read one, because the access rule is "the owner".
-- body is the last column so queries that skip it never walk past its overflow pages.
CREATE TABLE notes (
  id TEXT PRIMARY KEY,
  owner_id TEXT REFERENCES users (id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  body TEXT NOT NULL
);

-- SQLite does not index foreign keys. This serves "my notes, newest edit first" and the
-- lookup behind ON DELETE CASCADE.
CREATE INDEX notes_owner_updated ON notes (owner_id, updated_at DESC, id DESC);
