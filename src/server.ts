import { createApp } from './app';
import { openDatabase } from './db/database';

const port = Number(process.env.PORT ?? 3000);
const db = openDatabase(process.env.DATABASE_PATH ?? 'notes.db');

createApp({ db }).listen(port, () => {
  console.log(`team-notes-api listening on http://localhost:${port}`);
});
