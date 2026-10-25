import { createDb } from '../lib/client.js';
import { seedBasic } from '../lib/seed.js';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL tidak di-set');
  process.exit(1);
}

const db = createDb(url, { max: 2 });
const result = await seedBasic(db);
console.log(`seed ok: ${result.tasks} tasks, ${result.prompts} prompts, settings v${result.settingsVersion}`);
process.exit(0);
