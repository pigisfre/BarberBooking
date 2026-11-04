/**
 * Dati di prova realistici ma inventati (nessuna persona reale), relativi alla data di avvio,
 * cosi l'agenda di oggi e domani non e mai vuota.
 */
import { addDays, addMinutes, localDateOf, zonedToUtc, type LocalDate } from '@bb/core';
import type { Appointment, Service, StaffMember, WorkingHoursRow } from '../types';
import type { Customer, StoreState } from './store';

const TZ = 'Europe/Rome';

export const SEED_IDS = {
  owner: 'usr_titolare',
  marco: 'stf_marco',
  luca: 'stf_luca',
  giulia: 'stf_giulia',
};

export function createSeed(now: Date = new Date()): StoreState {
  const staff: StaffMember[] = [
    { id: SEED_IDS.marco, displayName: 'Marco', avatarUrl: null, colorIndex: 1, sortOrder: 0, bookableOnline: true, active: true },
    { id: SEED_IDS.luca, displayName: 'Luca', avatarUrl: null, colorIndex: 2, sortOrder: 1, bookableOnline: true, active: true },
    { id: SEED_IDS.giulia, displayName: 'Giulia', avatarUrl: null, colorIndex: 3, sortOrder: 2, bookableOnline: true, active: true },
  ];
  const all = staff.map((s) => s.id);
  const svc = (id: string, name: string, durationMin: number, priceCents: number, categoryId: string, staffIds = all, extra: Partial<Service> = {}): Service => ({
    id, name, durationMin, priceCents, categoryId, staffIds,
    description: null, currency: 'EUR', bookableOnline: true, active: true, sortOrder: 0, ...extra,
  });
  const services: Service[] = [
    svc('svc_taglio', 'Taglio', 30, 2000, 'cat_capelli', all, { description: 'Lavaggio, taglio e piega.' }),
    svc('svc_barba', 'Barba', 15, 1000, 'cat_barba', [SEED_IDS.marco, SEED_IDS.luca], { description: 'Rifinitura e contorno con panno caldo.' }),
    svc('svc_rasatura', 'Rasatura tradizionale', 30, 1800, 'cat_barba', [SEED_IDS.marco], { description: 'Con rasoio a mano libera.' }),
    svc('svc_bambino', 'Taglio bambino', 20, 1500, 'cat_capelli', all, { description: 'Fino a 12 anni.' }),
    svc('svc_sfumatura', 'Sfumatura', 45, 2500, 'cat_capelli', [SEED_IDS.luca, SEED_IDS.giulia]),
    svc('svc_colore', 'Colore', 60, 3500, 'cat_capelli', [SEED_IDS.giulia]),
  ].map((s, i) => ({ ...s, sortOrder: i }));

  // martedi-sabato; Marco e Luca con pausa pranzo, Giulia orario continuato; lunedi e domenica chiuso
  const hours: WorkingHoursRow[] = [];
  for (const weekday of [2, 3, 4, 5, 6]) {
    hours.push({ staffId: SEED_IDS.marco, weekday, opens: '09:00', closes: '13:00' });
    hours.push({ staffId: SEED_IDS.marco, weekday, opens: '15:00', closes: '19:30' });
    hours.push({ staffId: SEED_IDS.luca, weekday, opens: '09:00', closes: '12:30' });
    hours.push({ staffId: SEED_IDS.luca, weekday, opens: '14:30', closes: '19:00' });
    hours.push({ staffId: SEED_IDS.giulia, weekday, opens: '10:00', closes: '18:00' });
  }

  const names = ['Riccardo Bianchi', 'Giorgio Verdi', 'Federico Neri', 'Andrea Russo', 'Edoardo Gallo', 'Simone Conti', 'Tommaso Greco', 'Lorenzo Costa'];
  const customers: Customer[] = names.map((n, i) => ({
    id: `cus_${i + 1}`, profileId: null, fullName: n, phone: `+39333000${String(i + 1).padStart(4, '0')}`,
  }));

  const appointments: Appointment[] = [];
  const today = localDateOf(now, TZ);
  const add = (date: LocalDate, hhmm: string, staffId: string, customerIdx: number, serviceIds: string[], status: Appointment['status'] = 'confirmed') => {
    const [h, m] = hhmm.split(':').map(Number);
    const start = zonedToUtc(date, h! * 60 + m!, TZ);
    const lines = serviceIds.map((id) => services.find((s) => s.id === id)!);
    const dur = lines.reduce((n, s) => n + s.durationMin, 0);
    const c = customers[customerIdx]!;
    appointments.push({
      id: `apt_seed_${appointments.length + 1}`, customerId: c.id, customerName: c.fullName, staffId,
      startAt: start.toISOString(), endAt: addMinutes(start, dur).toISOString(), status, source: 'staff',
      customerNote: null, totalCents: lines.reduce((n, s) => n + s.priceCents, 0), currency: 'EUR',
      services: lines.map((s) => ({ serviceId: s.id, name: s.name, durationMin: s.durationMin, priceCents: s.priceCents })),
    });
  };
  for (const [offset, d] of [[0, today], [1, addDays(today, 1)], [-7, addDays(today, -7)]] as const) {
    add(d, '09:00', SEED_IDS.marco, 0, ['svc_taglio', 'svc_barba'], offset < 0 ? 'completed' : 'confirmed');
    add(d, '10:30', SEED_IDS.marco, 4, ['svc_taglio']);
    add(d, '09:15', SEED_IDS.luca, 1, ['svc_taglio'], offset === 0 ? 'completed' : 'confirmed');
    add(d, '11:00', SEED_IDS.luca, 2, ['svc_sfumatura'], offset === 0 ? 'pending' : 'confirmed');
    add(d, '10:00', SEED_IDS.giulia, 3, ['svc_colore']);
    if (offset !== 1) add(d, '16:00', SEED_IDS.marco, 5, ['svc_rasatura']);
  }

  const blockStart = (d: LocalDate) => zonedToUtc(d, 12 * 60, TZ);
  const blocks = [today, addDays(today, 1)].map((d, i) => ({
    id: `blk_${i}`, staffId: SEED_IDS.giulia, startAt: blockStart(d).toISOString(),
    endAt: addMinutes(blockStart(d), 60).toISOString(), reason: 'break' as const, note: 'Pausa pranzo',
  }));

  return {
    salon: {
      name: 'Barberia Demo', phone: '+39 06 0000000', email: 'demo@example.com', addressLine: 'Via di Prova 1',
      city: 'Roma', postalCode: '00100', timezone: TZ, currency: 'EUR',
      description: 'Barberia di quartiere: tagli classici e moderni, barba con panno caldo.',
      instagramUrl: null, bookingEnabled: true, slotIntervalMin: 15, minNoticeMin: 60, maxAdvanceDays: 60,
      cancelWindowMin: 120, requiresApproval: false,
    },
    categories: [
      { id: 'cat_capelli', name: 'Capelli', sortOrder: 0 },
      { id: 'cat_barba', name: 'Barba', sortOrder: 1 },
    ],
    services, staff, hours, blocks, customers, appointments,
    profiles: [{ id: SEED_IDS.owner, name: 'Titolare Demo', phone: null, email: 'titolare@demo.test' }],
    staffUsers: { [SEED_IDS.owner]: 'owner' },
  };
}
