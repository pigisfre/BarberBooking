/**
 * Vertical slice end-to-end (web): un cliente prenota dall'app Cliente,
 * il titolare lo vede nell'agenda del gestionale. Salva gli screenshot per replica-diff.
 *
 *   pnpm e2e        (= build web con EXPO_PUBLIC_BACKEND=fake + questo script)
 *
 * Avvia da solo il backend finto (porta 8787) e serve le due build web (8081 cliente, 8082 gestionale).
 * Fallisce se un passaggio non riesce o se una pagina scrive errori in console.
 */
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { readFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { createRequire } from 'node:module';

// Playwright preinstallato globalmente (o come devDependency): require lo trova in entrambi i casi
const { chromium } = createRequire(import.meta.url)('playwright');

const ROOT = resolve(import.meta.dirname, '..');
const SHOTS = join(ROOT, 'replica/clone-screens');
const TZ = 'Europe/Rome';
const CUSTOMER = 'Cliente Prova E2E';

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json', '.ttf': 'font/ttf' };
function serve(dir, port) {
  return new Promise((ok) => {
    const s = createServer(async (req, res) => {
      const path = decodeURIComponent((req.url ?? '/').split('?')[0]);
      let file = join(dir, path);
      if (!existsSync(file) || path.endsWith('/')) file = join(dir, 'index.html'); // fallback SPA
      try {
        res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
        res.end(await readFile(file));
      } catch {
        res.writeHead(404).end();
      }
    }).listen(port, () => ok(s));
  });
}

async function waitFor(url, tries = 50) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { method: 'POST' });
      if (r.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`non risponde: ${url}`);
}

function romeDate(offsetDays) {
  const d = new Date(Date.now() + offsetDays * 86400000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}
function isoWeekday(date) {
  const w = new Date(`${date}T12:00:00Z`).getUTCDay();
  return w === 0 ? 7 : w;
}

const failures = [];
function check(cond, msg) {
  if (!cond) failures.push(msg);
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${msg}`);
}

// un backend finto rimasto acceso da prima falserebbe il test
if (await fetch('http://localhost:8787/rpc/getSalon', { method: 'POST' }).then(() => true, () => false)) {
  console.error('la porta 8787 e gia occupata (un backend finto rimasto acceso?): chiudilo e riprova');
  process.exit(1);
}
// tsx in un gruppo di processi a se: alla fine si chiude tutto il gruppo (con pnpm resterebbe vivo il figlio)
const api = spawn(join(ROOT, 'node_modules/.bin/tsx'), ['packages/api/src/fake/server.ts'], {
  cwd: ROOT, stdio: 'ignore', detached: true, env: { ...process.env, FAKE_PORT: '8787' },
});
const stopApi = () => { try { process.kill(-api.pid, 'SIGTERM'); } catch {} };
const servers = [];
let browser;
try {
  await waitFor('http://localhost:8787/rpc/getSalon');
  await fetch('http://localhost:8787/rpc/__reset', { method: 'POST' });
  servers.push(await serve(join(ROOT, 'apps/client/dist'), 8081), await serve(join(ROOT, 'apps/business/dist'), 8082));
  await mkdir(SHOTS, { recursive: true });
  browser = await chromium.launch();

  const consoleErrors = [];
  const newPage = async (width, height, scheme = 'light') => {
    const ctx = await browser.newContext({ viewport: { width, height }, colorScheme: scheme, deviceScaleFactor: 1, timezoneId: TZ, locale: 'it-IT' });
    const p = await ctx.newPage();
    p.on('console', (m) => m.type() === 'error' && consoleErrors.push(`${p.url()}: ${m.text()}`));
    p.on('pageerror', (e) => consoleErrors.push(`${p.url()}: ${e.message}`));
    return p;
  };
  const shot = (p, name) => p.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: true });

  // primo giorno lavorativo dopo oggi (il seed chiude lunedi e domenica)
  let day = romeDate(1);
  for (let i = 2; [1, 7].includes(isoWeekday(day)); i++) day = romeDate(i);

  // ------------------------------------------------------------- cliente, telefono
  const c = await newPage(390, 844);
  await c.goto('http://localhost:8081/');
  await c.getByTestId('service-svc_taglio').waitFor();
  await shot(c, 'S04-S05-home-390');
  await c.getByTestId('service-svc_taglio').click();
  await c.getByTestId('service-svc_barba').click();
  const cta = await c.getByTestId('continue-services').innerText();
  check(/45 min/.test(cta) && /30,00/.test(cta), `CTA aggiornata con durata e totale ("${cta.replace(/\s+/g, ' ')}")`);
  await c.getByTestId('continue-services').click();

  await c.getByTestId('staff-stf_marco').waitFor();
  check(!(await c.getByTestId('staff-stf_giulia').count()), 'S06 mostra solo chi fa taglio + barba (Giulia esclusa)');
  await shot(c, 'S06-operatore-390');
  await c.getByTestId('staff-stf_marco').click();
  await c.getByTestId('continue-staff').click();

  await c.getByTestId(`day-${day}`).click();
  const firstSlot = c.locator('[data-testid^="slot-"]').first();
  await firstSlot.waitFor();
  const slotLabel = (await firstSlot.getAttribute('data-testid')).replace('slot-', '');
  check(slotLabel === '9:15' || slotLabel === '9:45', `S07 primo slot libero di Marco dopo l'appuntamento delle 9:00 (${slotLabel})`);
  await shot(c, 'S07-orario-390');
  await firstSlot.click();
  await c.getByTestId('continue-time').click();

  await c.getByTestId('auth-name').waitFor();
  await shot(c, 'S08-riepilogo-ospite-390');
  await c.getByTestId('auth-submit').click();
  check(await c.getByText('Scrivi nome e cognome.').isVisible(), 'S02 errore inline se mancano i dati');
  await c.getByTestId('auth-name').fill(CUSTOMER);
  await c.getByTestId('auth-phone').fill('+39 333 999 8877');
  await c.getByTestId('auth-submit').click();
  await c.getByTestId('confirm').waitFor();
  await shot(c, 'S08-riepilogo-390');
  // doppio tap: la stessa chiave non deve creare due appuntamenti
  await c.getByTestId('confirm').evaluate((el) => { el.click(); el.click(); }); // due tocchi nello stesso istante
  await c.getByTestId('confirmed-title').waitFor();
  await c.waitForTimeout(600);
  await shot(c, 'S09-confermato-390');

  // stesso slot da un secondo cliente: deve essere rifiutato
  const book2 = await fetch('http://localhost:8787/rpc/signInCustomer', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Altro', phone: '+39 333 111 2222' }) }).then((r) => r.json());
  const slotsAfter = await fetch('http://localhost:8787/rpc/getAvailability', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ date: day, serviceIds: ['svc_taglio', 'svc_barba'], staffId: 'stf_marco' }) }).then((r) => r.json());
  check(!slotsAfter.some((s) => new Intl.DateTimeFormat('it-IT', { timeZone: TZ, hour: 'numeric', minute: '2-digit' }).format(new Date(s.startAt)) === slotLabel), `lo slot ${slotLabel} non e piu libero dopo la prenotazione`);
  void book2;

  await c.goto('http://localhost:8081/appuntamenti');
  await c.locator('[data-testid^="my-appt-"]').first().waitFor();
  check((await c.locator('[data-testid^="my-appt-"]').count()) === 1, 'S10 il cliente vede un solo appuntamento (nessun doppione dal doppio tap)');
  await shot(c, 'S10-appuntamenti-390');

  // ------------------------------------------------------------- cliente, desktop e tema scuro
  const cd = await newPage(1440, 900, 'dark');
  await cd.goto('http://localhost:8081/');
  await cd.getByTestId('service-svc_taglio').waitFor();
  await shot(cd, 'S04-S05-home-1440-dark');

  // ------------------------------------------------------------- gestionale
  const b = await newPage(1440, 900);
  await b.goto('http://localhost:8082/');
  await b.getByTestId('staff-email').waitFor();
  check(b.url().endsWith('/accedi'), 'S21 senza accesso si finisce sulla pagina di accesso');
  await shot(b, 'S21-accesso-1440');
  await b.getByTestId('staff-email').fill('titolare@barberbooking.demo');
  await b.getByTestId('staff-submit').click();
  await b.getByText('Prossimi clienti').waitFor();
  await shot(b, 'S22-oggi-1440');
  await b.getByTestId('nav-agenda').click();
  await b.getByTestId('agenda-title').waitFor();
  await b.getByTestId(`day-${day}`).click();
  const booked = b.getByLabel(new RegExp(`${CUSTOMER}`));
  await booked.first().waitFor({ timeout: 10000 });
  check((await booked.count()) === 1, `S23 la prenotazione di "${CUSTOMER}" compare nell'agenda del ${day}`);
  const inMarco = await b.getByTestId('agenda-col-stf_marco').getByLabel(new RegExp(CUSTOMER)).count();
  check(inMarco === 1, 'S23 ed e nella colonna di Marco');
  await shot(b, 'S23-agenda-1440');

  const bm = await newPage(390, 844);
  await bm.goto('http://localhost:8082/accedi');
  await bm.getByTestId('staff-email').fill('titolare@barberbooking.demo');
  await bm.getByTestId('staff-submit').click();
  await bm.getByText('Prossimi clienti').waitFor();
  await shot(bm, 'S22-oggi-390');
  await bm.getByTestId('nav-agenda').click();
  await bm.getByTestId('agenda-title').waitFor();
  await bm.getByTestId(`day-${day}`).click();
  await bm.waitForTimeout(500);
  await shot(bm, 'S23-agenda-390');

  // ------------------------------------------------------------- sicurezza minima del backend finto
  const anon = await fetch('http://localhost:8787/rpc/listAppointments', { method: 'POST', body: '{}' });
  check(anon.status === 400, 'un utente anonimo non legge l agenda');
  const asCustomer = await fetch('http://localhost:8787/rpc/listAppointments', { method: 'POST', headers: { authorization: `Bearer ${book2.userId}` }, body: '{}' });
  check(asCustomer.status === 400, 'un cliente non legge l agenda');

  check(consoleErrors.length === 0, `nessun errore in console${consoleErrors.length ? ':\n  ' + consoleErrors.join('\n  ') : ''}`);
} catch (e) {
  failures.push(String(e?.stack ?? e));
  console.error(e);
} finally {
  await browser?.close();
  servers.forEach((s) => s.close());
  stopApi();
}
console.log(failures.length ? `\n${failures.length} controlli falliti` : '\ntutti i controlli passati');
process.exit(failures.length ? 1 : 0);
