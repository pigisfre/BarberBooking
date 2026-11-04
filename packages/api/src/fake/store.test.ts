/**
 * Lo store finto deve comportarsi come book_appointment() in replica/schema.sql:
 * stessi casi di replica/test/schema.test.sql, stessi codici d'errore.
 *
 * Seed, mercoledi di domani:
 *   Marco  orario 9-13 e 15-19:30, occupato 9:00-9:45, 10:30-11:00, 16:00-16:30
 *   Luca   orario 9-12:30 e 14:30-19, occupato 9:15-9:45, 11:00-11:45
 *   Giulia orario 10-18, occupata 10:00-11:00, pausa 12:00-13:00
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { BookingError, addDays, formatTime, isoWeekday, localDateOf, zonedToUtc } from '@bb/core';
import { createSeed, SEED_IDS } from './seed';
import { FakeStore } from './store';

const TZ = 'Europe/Rome';
const NOW = zonedToUtc('2026-11-10', 12 * 60, TZ); // martedi a mezzogiorno
const TODAY = localDateOf(NOW, TZ);
const TOMORROW = addDays(TODAY, 1);
const at = (hhmm: string, date = TOMORROW) => {
  const [h, m] = hhmm.split(':').map(Number);
  return zonedToUtc(date, h! * 60 + m!, TZ).toISOString();
};

let store: FakeStore;
let b: string;
let c: string;
let n = 0;
const book = (user: string | null, staffId: string, serviceIds: string[], startAt: string, extra: object = {}) =>
  store.book(user, { staffId, serviceIds, startAt, source: 'app', idempotencyKey: `k${n++}`, ...extra }, NOW);
const errorOf = (fn: () => unknown): string => {
  try {
    fn();
    return 'ok';
  } catch (e) {
    if (e instanceof BookingError) return e.code;
    throw e;
  }
};

beforeEach(() => {
  store = new FakeStore(createSeed(NOW));
  b = store.signInCustomer('Cliente Uno', '+390000000002').userId;
  c = store.signInCustomer('Cliente Due', '+390000000003').userId;
});

describe('prenotazione (come book_appointment)', () => {
  it('il giorno di prova e un mercoledi', () => expect(isoWeekday(TOMORROW)).toBe(3));

  it('taglio + barba: durata 45 minuti e totale 30 euro', () => {
    const { id } = book(b, SEED_IDS.marco, ['svc_taglio', 'svc_barba'], at('11:15'));
    const a = store.state.appointments.find((x) => x.id === id)!;
    expect((new Date(a.endAt).getTime() - new Date(a.startAt).getTime()) / 60000).toBe(45);
    expect(a.totalCents).toBe(3000);
    expect(a.status).toBe('confirmed');
  });

  it('doppio tap con la stessa chiave: stesso id, nessun duplicato', () => {
    const input = { staffId: SEED_IDS.marco, serviceIds: ['svc_taglio'], startAt: at('11:15'), source: 'app' as const, idempotencyKey: 'stessa' };
    const before = store.state.appointments.length;
    const first = store.book(b, input, NOW);
    const second = store.book(b, input, NOW);
    expect(second.id).toBe(first.id);
    expect(store.state.appointments.length).toBe(before + 1);
  });

  it('slot sovrapposto rifiutato, quello subito dopo accettato', () => {
    book(b, SEED_IDS.marco, ['svc_taglio', 'svc_barba'], at('11:15')); // 11:15-12:00
    expect(errorOf(() => book(c, SEED_IDS.marco, ['svc_taglio'], at('11:30')))).toBe('slot_unavailable');
    expect(errorOf(() => book(c, SEED_IDS.marco, ['svc_taglio'], at('12:00')))).toBe('ok');
  });

  it('fuori orario: nella pausa pranzo e oltre la chiusura della fascia', () => {
    expect(errorOf(() => book(c, SEED_IDS.marco, ['svc_taglio'], at('14:00')))).toBe('outside_hours');
    expect(errorOf(() => book(c, SEED_IDS.marco, ['svc_taglio'], at('12:45')))).toBe('outside_hours');
  });

  it('servizio che l operatore non fa, o inesistente', () => {
    expect(errorOf(() => book(c, SEED_IDS.giulia, ['svc_barba'], at('15:00')))).toBe('invalid_services');
    expect(errorOf(() => book(c, SEED_IDS.giulia, ['svc_nessuno'], at('15:00')))).toBe('invalid_services');
  });

  it('pausa dell operatore: slot non disponibile', () => {
    expect(errorOf(() => book(c, SEED_IDS.giulia, ['svc_taglio'], at('12:15')))).toBe('slot_unavailable');
  });

  it('preavviso minimo, anticipo massimo, utente non loggato', () => {
    expect(errorOf(() => book(c, SEED_IDS.marco, ['svc_taglio'], at('12:30', TODAY)))).toBe('too_late');
    expect(errorOf(() => book(c, SEED_IDS.marco, ['svc_taglio'], at('11:15', addDays(TODAY, 70))))).toBe('too_far');
    expect(errorOf(() => book(null, SEED_IDS.marco, ['svc_taglio'], at('11:15')))).toBe('auth_required');
  });

  it('telefono verificato: la scheda inserita dal barbiere si collega al cliente', () => {
    const before = store.state.customers.length;
    const u = store.signInCustomer('Ricky', '+39 333 000 0001', true).userId; // stesso numero di "Riccardo Bianchi" nel seed
    book(u, SEED_IDS.marco, ['svc_taglio'], at('11:15'));
    expect(store.state.customers.length).toBe(before);
    const mine = store.myAppointments(u);
    expect(mine.map((a) => a.customerName)).toContain('Riccardo Bianchi');
    // vede anche gli appuntamenti che il barbiere gli aveva gia segnato
    expect(mine.length).toBeGreaterThan(1);
  });

  it('telefono NON verificato: nessun accesso alla scheda (e allo storico) di un altro', () => {
    const u = store.signInCustomer('Furbetto', '+39 333 000 0001').userId;
    book(u, SEED_IDS.marco, ['svc_taglio'], at('11:15'));
    expect(store.myAppointments(u)).toHaveLength(1);
    expect(store.myAppointments(u)[0]!.customerName).toBe('Furbetto');
  });

  it('ogni cliente vede solo i propri appuntamenti', () => {
    book(b, SEED_IDS.marco, ['svc_taglio'], at('11:15'));
    book(c, SEED_IDS.luca, ['svc_taglio'], at('12:00'));
    expect(store.myAppointments(c).every((a) => a.staffId === SEED_IDS.luca)).toBe(true);
    expect(store.myAppointments(c)).toHaveLength(1);
    expect(errorOf(() => store.myAppointments(null))).toBe('auth_required');
  });

  it('lo staff deve indicare il cliente e puo prenotare fuori orario', () => {
    const owner = SEED_IDS.owner;
    const input = { staffId: SEED_IDS.marco, serviceIds: ['svc_taglio'], startAt: at('14:00'), source: 'staff' as const, idempotencyKey: 'x1' };
    expect(errorOf(() => store.book(owner, input, NOW))).toBe('customer_required');
    expect(errorOf(() => store.book(owner, { ...input, customerId: 'cus_2' }, NOW))).toBe('ok');
    expect(errorOf(() => store.book(b, { ...input, idempotencyKey: 'x2' }, NOW))).toBe('forbidden');
  });

  it('annullamento: solo i propri, solo fuori dalla finestra di 2 ore', () => {
    const { id } = book(b, SEED_IDS.marco, ['svc_taglio'], at('11:15'));
    expect(errorOf(() => store.cancel(c, id, NOW))).toBe('forbidden');
    expect(errorOf(() => store.cancel(b, id, NOW))).toBe('ok');
    const soon = book(b, SEED_IDS.giulia, ['svc_taglio'], at('13:30', TODAY)).id; // tra 90 minuti
    expect(errorOf(() => store.cancel(b, soon, NOW))).toBe('too_late');
  });

  it('dopo la prenotazione l orario sparisce dagli slot liberi', () => {
    const q = { date: TOMORROW, serviceIds: ['svc_taglio'], staffId: SEED_IDS.marco };
    const free = () => store.availability(q, NOW).map((s) => formatTime(new Date(s.startAt), TZ));
    expect(free()).toContain('11:15');
    book(b, SEED_IDS.marco, ['svc_taglio'], at('11:15'));
    expect(free()).not.toContain('11:15');
    expect(free()).not.toContain('11:30');
    expect(free()).toContain('11:45');
  });

  it('cancellazione account: profilo via, scheda anonima, appuntamenti futuri annullati', () => {
    const { id } = book(b, SEED_IDS.marco, ['svc_taglio'], at('11:15'));
    store.deleteAccount(b, NOW);
    expect(store.session(b)).toBeNull();
    const a = store.state.appointments.find((x) => x.id === id)!;
    expect(a.status).toBe('cancelled');
    expect(a.customerName).toBe('Cliente eliminato');
    expect(store.state.customers.some((c) => c.fullName === 'Cliente Uno')).toBe(false);
    expect(errorOf(() => store.deleteAccount(SEED_IDS.owner, NOW))).toBe('forbidden');
  });

  it('solo lo staff legge l agenda', () => {
    expect(errorOf(() => store.requireStaff(b))).toBe('forbidden');
    expect(errorOf(() => store.requireStaff(SEED_IDS.owner))).toBe('ok');
  });
});
