-- A single static row the readiness endpoint reads to prove the database is reachable
-- and migrations have run. The content is intentionally meaningless.
CREATE TABLE health_check (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  message TEXT NOT NULL
);

INSERT INTO health_check (id, message) VALUES (1, 'ok');
