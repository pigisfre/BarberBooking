import { describe, expect, it } from 'vitest';
import {
  addDays,
  availableSlots,
  dayPart,
  eligibleStaff,
  formatDateLong,
  formatDuration,
  formatPrice,
  formatTime,
  isoWeekday,
  localDateOf,
  summarize,
  zonedToUtc,
  type SlotData,
} from './index';

const TZ = 'Europe/Rome';
const allWeek = (staffId: string, opens = '09:00', closes = '19:00') =>
  [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ staffId, weekday, opens, closes }));

function data(over: Partial<SlotData> = {}): SlotData {
  return {
    rules: { timeZone: TZ, slotIntervalMin: 15, minNoticeMin: 60, maxAdvanceDays: 60 },
    services: [
      { id: 'taglio', durationMin: 30, priceCents: 2000, active: true, bookableOnline: true, staffIds: ['marco', 'luca'] },
      { id: 'barba', durationMin: 15, priceCents: 1000, active: true, bookableOnline: true, staffIds: ['marco'] },
      { id: 'interno', durationMin: 30, priceCents: 0, active: true, bookableOnline: false, staffIds: ['marco'] },
      { id: 'vecchio', durationMin: 30, priceCents: 1500, active: false, bookableOnline: true, staffIds: ['marco'] },
    ],
    staff: [
      { id: 'marco', active: true, bookableOnline: true, sortOrder: 0 },
      { id: 'luca', active: true, bookableOnline: true, sortOrder: 1 },
    ],
    hours: [...allWeek('marco'), ...allWeek('luca')],
    busy: [],
    ...over,
  };
}

const DAY = '2026-11-11'; // un mercoledi in ora solare (UTC+1)
const NOW = new Date('2026-11-10T08:00:00Z');
const at = (date: string, hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return zonedToUtc(date, h! * 60 + m!, TZ);
};
const times = (slots: { start: Date }[]) => slots.map((s) => formatTime(s.start, TZ));

describe('fuso orario', () => {
  it('converte ora locale di Roma in UTC, in ora solare e legale', () => {
    expect(at('2026-11-11', '09:00').toISOString()).toBe('2026-11-11T08:00:00.000Z'); // +1
    expect(at('2026-07-15', '09:00').toISOString()).toBe('2026-07-15T07:00:00.000Z'); // +2
  });
  it('gestisce il giorno del passaggio all ora legale (28 marzo 2027)', () => {
    expect(at('2027-03-28', '01:30').toISOString()).toBe('2027-03-28T00:30:00.000Z');
    expect(at('2027-03-28', '09:00').toISOString()).toBe('2027-03-28T07:00:00.000Z');
  });
  it('gestisce il giorno del ritorno all ora solare (25 ottobre 2026)', () => {
    expect(at('2026-10-25', '09:00').toISOString()).toBe('2026-10-25T08:00:00.000Z');
    expect(at('2026-10-24', '09:00').toISOString()).toBe('2026-10-24T07:00:00.000Z');
  });
  it('giorno della settimana ISO e somma di giorni', () => {
    expect(isoWeekday('2024-01-01')).toBe(1); // lunedi
    expect(isoWeekday('2024-01-07')).toBe(7); // domenica
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(localDateOf(new Date('2026-11-10T23:30:00Z'), TZ)).toBe('2026-11-11');
  });
});

describe('servizi e operatori', () => {
  it('somma durata e prezzo', () => {
    expect(summarize(data().services, ['taglio', 'barba'])).toEqual({ durationMin: 45, totalCents: 3000 });
  });
  it('solo chi fa tutti i servizi scelti', () => {
    expect(eligibleStaff(data(), ['taglio']).map((s) => s.id)).toEqual(['marco', 'luca']);
    expect(eligibleStaff(data(), ['taglio', 'barba']).map((s) => s.id)).toEqual(['marco']);
  });
  it('servizi disattivati o non prenotabili online: nessuno slot per il cliente', () => {
    expect(availableSlots(data(), { date: DAY, serviceIds: ['vecchio'], staffId: 'marco', now: NOW })).toEqual([]);
    expect(availableSlots(data(), { date: DAY, serviceIds: ['interno'], staffId: 'marco', now: NOW })).toEqual([]);
  });
  it('lo staff puo prenotare servizi non visibili online', () => {
    const s = availableSlots(data(), { date: DAY, serviceIds: ['interno'], staffId: 'marco', now: NOW, asStaff: true });
    expect(s.length).toBeGreaterThan(0);
  });
  it('operatore che non fa il servizio: nessuno slot', () => {
    expect(availableSlots(data(), { date: DAY, serviceIds: ['barba'], staffId: 'luca', now: NOW })).toEqual([]);
  });
});

describe('slot di un giorno', () => {
  it('passo di 15 minuti, ultimo slot che finisce alla chiusura', () => {
    const s = times(availableSlots(data(), { date: DAY, serviceIds: ['taglio', 'barba'], staffId: 'marco', now: NOW }));
    expect(s[0]).toBe('9:00');
    expect(s[1]).toBe('9:15');
    expect(s.at(-1)).toBe('18:15'); // 18:15 + 45 min = 19:00
    expect(s).not.toContain('18:30');
  });
  it('salta gli orari occupati da appuntamenti e pause (intervalli semiaperti)', () => {
    const busy = [
      { staffId: 'marco', start: at(DAY, '10:00'), end: at(DAY, '10:45') }, // appuntamento
      { staffId: 'marco', start: at(DAY, '13:00'), end: at(DAY, '14:00') }, // pausa
    ];
    const s = times(availableSlots(data({ busy }), { date: DAY, serviceIds: ['taglio'], staffId: 'marco', now: NOW }));
    expect(s).toContain('9:30'); // 9:30-10:00 tocca ma non sovrappone
    expect(s).not.toContain('9:45');
    expect(s).not.toContain('10:30');
    expect(s).toContain('10:45');
    expect(s).toContain('12:30');
    expect(s).not.toContain('12:45');
    expect(s).toContain('14:00');
  });
  it('una chiusura del salone (staffId null) blocca tutti', () => {
    const busy = [{ staffId: null, start: at(DAY, '00:00'), end: at(DAY, '23:59') }];
    expect(availableSlots(data({ busy }), { date: DAY, serviceIds: ['taglio'], staffId: 'any', now: NOW })).toEqual([]);
  });
  it('preavviso minimo e anticipo massimo', () => {
    const now = at(DAY, '09:20');
    const s = times(availableSlots(data(), { date: DAY, serviceIds: ['taglio'], staffId: 'marco', now }));
    expect(s[0]).toBe('10:30'); // 9:20 + 60 min = 10:20 -> primo slot utile 10:30
    const far = availableSlots(data(), { date: addDays(DAY, 61), serviceIds: ['taglio'], staffId: 'marco', now: NOW });
    expect(far).toEqual([]);
  });
  it('giorno di chiusura settimanale: nessuno slot', () => {
    const hours = allWeek('marco').filter((h) => h.weekday !== 3);
    expect(availableSlots(data({ hours }), { date: DAY, serviceIds: ['taglio'], staffId: 'marco', now: NOW })).toEqual([]);
  });
  it('orari divisi (pausa pranzo come due fasce)', () => {
    const hours = [3].flatMap((weekday) => [
      { staffId: 'marco', weekday, opens: '09:00', closes: '12:30' },
      { staffId: 'marco', weekday, opens: '15:00', closes: '19:00' },
    ]);
    const s = times(availableSlots(data({ hours }), { date: DAY, serviceIds: ['taglio'], staffId: 'marco', now: NOW }));
    expect(s).toContain('12:00');
    expect(s).not.toContain('12:15');
    expect(s).not.toContain('14:45');
    expect(s).toContain('15:00');
  });
  it('nei giorni del cambio d ora gli slot restano in ora locale', () => {
    const now = new Date('2027-03-20T08:00:00Z');
    const s = availableSlots(data(), { date: '2027-03-28', serviceIds: ['taglio'], staffId: 'marco', now });
    expect(formatTime(s[0]!.start, TZ)).toBe('9:00');
    expect(s[0]!.start.toISOString()).toBe('2027-03-28T07:00:00.000Z');
    const now2 = new Date('2026-10-20T08:00:00Z');
    const s2 = availableSlots(data(), { date: '2026-10-25', serviceIds: ['taglio'], staffId: 'marco', now: now2 });
    expect(s2[0]!.start.toISOString()).toBe('2026-10-25T08:00:00.000Z');
    expect(times(s2).at(-1)).toBe('18:30');
  });
});

describe('primo disponibile', () => {
  it('un solo slot per orario, assegnato a chi ha meno appuntamenti quel giorno', () => {
    const busy = [{ staffId: 'marco', start: at(DAY, '15:00'), end: at(DAY, '15:30') }];
    const s = availableSlots(data({ busy }), { date: DAY, serviceIds: ['taglio'], staffId: 'any', now: NOW });
    const nine = s.find((x) => formatTime(x.start, TZ) === '9:00')!;
    expect(nine.staffId).toBe('luca');
    expect(new Set(s.map((x) => x.start.getTime())).size).toBe(s.length);
    const three = s.find((x) => formatTime(x.start, TZ) === '15:00')!;
    expect(three.staffId).toBe('luca');
  });
});

describe('formattazione italiana', () => {
  it('prezzi, durate, date', () => {
    expect(formatPrice(3000).replace(/\s/g, ' ')).toBe('30,00 €');
    expect(formatDuration(45)).toBe('45 min');
    expect(formatDuration(90)).toBe('1 h 30 min');
    expect(formatDateLong('2026-11-11')).toBe('mercoledì 11 novembre');
    expect(dayPart(9 * 60)).toBe('mattina');
    expect(dayPart(14 * 60)).toBe('pomeriggio');
    expect(dayPart(18 * 60 + 30)).toBe('sera');
  });
});
