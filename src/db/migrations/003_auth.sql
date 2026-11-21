-- Accounts created before passwords existed get an empty hash, which never verifies,
-- so they cannot sign in.
ALTER TABLE users ADD COLUMN password_hash TEXT NOT NULL DEFAULT '';

-- Only a hash of each session token is stored; the token itself is shown once, at sign-in.
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE INDEX sessions_user_id ON sessions (user_id);
