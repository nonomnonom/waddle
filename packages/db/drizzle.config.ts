import { defineConfig } from 'drizzle-kit';

/**
 * Migrasi dihasilkan dari skema TS, bukan dari schema.sql di docs (docs = referensi desain,
 * skema TS = sumber kebenaran). Alur: db:generate -> review SQL -> db:migrate.
 */
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/lib/schema.ts',
  out: './drizzle',
  strict: true,
  verbose: true,
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://waddle:waddle@localhost:5433/waddle',
  },
});
