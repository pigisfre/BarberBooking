// Genera supabase/demo-setup.sql: migrazioni + dati demo in un unico file da incollare nello SQL Editor di Supabase.
//   pnpm demo-sql
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = import.meta.dirname;
const migrations = readdirSync(join(dir, 'migrations')).filter((f) => f.endsWith('.sql')).sort();
const parts = [
  '-- BarberBooking: configurazione del progetto Supabase della DEMO (generato da supabase/build-demo-sql.mjs: non modificare a mano).',
  '-- Incollalo tutto nello SQL Editor di un progetto VUOTO e premi Run. Poi esegui supabase/demo-staff.sql (vedi README).',
  '',
  ...migrations.map((f) => `-- ===== migrations/${f}\n${readFileSync(join(dir, 'migrations', f), 'utf8')}`),
  `-- ===== seed.sql\n${readFileSync(join(dir, 'seed.sql'), 'utf8')}`,
];
writeFileSync(join(dir, 'demo-setup.sql'), parts.join('\n'));
console.log(`supabase/demo-setup.sql: ${migrations.length} migrazioni + seed`);
