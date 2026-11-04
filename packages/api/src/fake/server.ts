/**
 * Server di sviluppo con il backend finto: le due app (cliente e gestionale) lo condividono,
 * cosi una prenotazione fatta dal cliente compare subito nell'agenda del barbiere.
 *
 *   pnpm dev:server            (porta 8787, oppure FAKE_PORT)
 *
 * Protocollo: POST /rpc/<metodo> con JSON { ...argomenti }, header Authorization: Bearer <userId>.
 * Errori: 400 { error: <codice BookingError> }. Solo per sviluppo: nessuna sicurezza reale.
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { BookingError } from '@bb/core';
import { createSeed } from './seed';
import { FakeStore } from './store';

export function startFakeServer(port = Number(process.env.FAKE_PORT ?? 8787)) {
  let store = new FakeStore(createSeed());

  const handlers: Record<string, (user: string | null, args: any) => unknown> = {
    getSalon: () => store.state.salon,
    listCategories: () => store.state.categories,
    listServices: (u) => (store.isStaff(u) ? store.state.services : store.publicServices()),
    listStaff: (u) => (store.isStaff(u) ? store.state.staff : store.publicStaff()),
    listWorkingHours: () => store.state.hours,
    getAvailability: (u, a) => store.availability(a, new Date(), store.isStaff(u) && a.asStaff === true),
    getSession: (u) => store.session(u),
    signInCustomer: (_u, a) => store.signInCustomer(String(a.name ?? ''), String(a.phone ?? '')),
    signInStaff: (_u, a) => store.signInStaff(String(a.email ?? '')),
    bookAppointment: (u, a) => store.book(u, a, new Date()),
    listMyAppointments: (u) => store.myAppointments(u),
    cancelAppointment: (u, a) => store.cancel(u, String(a.id), new Date()),
    listAppointments: (u, a) => (store.requireStaff(u), store.appointmentsBetween(a.from, a.to)),
    listTimeBlocks: (u, a) => (store.requireStaff(u), store.blocksBetween(a.from, a.to)),
    getDayStats: (u, a) => (store.requireStaff(u), store.dayStats(a.date)),
    __reset: () => {
      store = new FakeStore(createSeed());
      return { ok: true };
    },
  };

  const send = (res: ServerResponse, status: number, body: unknown) => {
    res.writeHead(status, {
      'content-type': 'application/json',
      'access-control-allow-origin': '*',
      'access-control-allow-headers': 'authorization, content-type',
      'access-control-allow-methods': 'POST, OPTIONS',
    });
    res.end(JSON.stringify(body ?? null));
  };

  const readJson = (req: IncomingMessage) =>
    new Promise<any>((resolve, reject) => {
      let raw = '';
      req.on('data', (c) => (raw += c));
      req.on('end', () => {
        try {
          resolve(raw ? JSON.parse(raw) : {});
        } catch (e) {
          reject(e);
        }
      });
    });

  const server = createServer(async (req, res) => {
    if (req.method === 'OPTIONS') return send(res, 204, null);
    const m = /^\/rpc\/(\w+)$/.exec(req.url ?? '');
    const handler = m && handlers[m[1]!];
    if (req.method !== 'POST' || !handler) return send(res, 404, { error: 'not_found' });
    const auth = req.headers.authorization;
    const user = auth?.startsWith('Bearer ') ? auth.slice(7) || null : null;
    try {
      const args = await readJson(req);
      send(res, 200, await handler(user, args));
    } catch (e) {
      if (e instanceof BookingError) return send(res, 400, { error: e.code });
      console.error(e);
      send(res, 500, { error: 'internal' });
    }
  });
  server.listen(port, () => console.log(`backend finto su http://localhost:${port}`));
  return server;
}

const isMain = process.argv[1] && /server\.(ts|js)$/.test(process.argv[1]);
if (isMain) startFakeServer();
