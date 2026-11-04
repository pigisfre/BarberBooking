/**
 * Calcolo degli orari prenotabili. Gira nella Edge Function `availability` (con i dati privati:
 * pause e appuntamenti altrui) e nel data layer finto durante lo sviluppo.
 * Le stesse regole le ricontrolla `book_appointment()` nel database: questa e la vista, quella la garanzia.
 */
import {
  addMinutes,
  isoWeekday,
  localDateOf,
  overlaps,
  parseLocalTime,
  zonedToUtc,
  type LocalDate,
  type LocalTime,
} from './time';

export interface ServiceInfo {
  id: string;
  durationMin: number;
  priceCents: number;
  active: boolean;
  bookableOnline: boolean;
  staffIds: string[];
}

export interface StaffInfo {
  id: string;
  active: boolean;
  bookableOnline: boolean;
  sortOrder: number;
}

export interface WorkingHours {
  staffId: string;
  weekday: number; // 1 = lunedi
  opens: LocalTime;
  closes: LocalTime;
}

export interface Busy {
  staffId: string | null; // null = vale per tutto il salone (chiusura)
  start: Date;
  end: Date;
  /** per "primo disponibile" contano solo gli appuntamenti, non le pause (come get_available_slots) */
  kind?: 'appointment' | 'block';
}

export interface BookingRules {
  timeZone: string;
  slotIntervalMin: number;
  minNoticeMin: number;
  maxAdvanceDays: number;
}

export interface SlotQuery {
  date: LocalDate;
  serviceIds: string[];
  /** id operatore, oppure 'any' = primo disponibile */
  staffId: string | 'any';
  now: Date;
  /** true per lo staff: ignora preavviso, anticipo massimo e i flag "prenotabile online" */
  asStaff?: boolean;
}

export interface SlotData {
  rules: BookingRules;
  services: ServiceInfo[];
  staff: StaffInfo[];
  hours: WorkingHours[];
  /** appuntamenti attivi (pending/confirmed) e pause/ferie/chiusure */
  busy: Busy[];
}

export interface Slot {
  start: Date;
  end: Date;
  staffId: string;
}

export interface Selection {
  durationMin: number;
  totalCents: number;
}

/** Durata e totale dei servizi scelti. Lancia se un servizio non esiste. */
export function summarize(services: ServiceInfo[], ids: string[]): Selection {
  let durationMin = 0;
  let totalCents = 0;
  for (const id of ids) {
    const s = services.find((x) => x.id === id);
    if (!s) throw new Error(`servizio sconosciuto: ${id}`);
    durationMin += s.durationMin;
    totalCents += s.priceCents;
  }
  return { durationMin, totalCents };
}

/** Operatori che possono fare TUTTI i servizi scelti. */
export function eligibleStaff(data: SlotData, serviceIds: string[], asStaff = false): StaffInfo[] {
  const chosen = data.services.filter((s) => serviceIds.includes(s.id));
  if (chosen.length !== serviceIds.length || chosen.length === 0) return [];
  if (chosen.some((s) => !s.active || (!asStaff && !s.bookableOnline))) return [];
  return data.staff
    .filter((st) => st.active && (asStaff || st.bookableOnline))
    .filter((st) => chosen.every((s) => s.staffIds.includes(st.id)))
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

function slotsForStaff(data: SlotData, q: SlotQuery, staffId: string, durationMin: number): Slot[] {
  const { rules } = data;
  const weekday = isoWeekday(q.date);
  const earliest = q.asStaff ? null : addMinutes(q.now, rules.minNoticeMin);
  const latest = q.asStaff ? null : addMinutes(q.now, rules.maxAdvanceDays * 24 * 60);
  const busy = data.busy.filter((b) => b.staffId === staffId || b.staffId === null);
  const out: Slot[] = [];

  for (const h of data.hours) {
    if (h.staffId !== staffId || h.weekday !== weekday) continue;
    const opens = parseLocalTime(h.opens);
    const closes = parseLocalTime(h.closes);
    for (let m = opens; m + durationMin <= closes; m += rules.slotIntervalMin) {
      const start = zonedToUtc(q.date, m, rules.timeZone);
      // nei giorni del cambio d'ora un'ora locale puo non esistere: lo slot deve restare nella data scelta
      if (localDateOf(start, rules.timeZone) !== q.date) continue;
      const end = addMinutes(start, durationMin);
      if (earliest && start < earliest) continue;
      if (latest && start > latest) continue;
      if (busy.some((b) => overlaps(start, end, b.start, b.end))) continue;
      out.push({ start, end, staffId });
    }
  }
  return out.sort((a, b) => a.start.getTime() - b.start.getTime());
}

/**
 * Orari liberi di un giorno.
 * Con staffId = 'any' restituisce un solo slot per orario, assegnato all'operatore
 * con meno appuntamenti quel giorno (a parita, il primo in ordine), per distribuire il lavoro.
 */
export function availableSlots(data: SlotData, q: SlotQuery): Slot[] {
  const staff = eligibleStaff(data, q.serviceIds, q.asStaff);
  if (staff.length === 0) return [];
  const { durationMin } = summarize(data.services, q.serviceIds);

  if (q.staffId !== 'any') {
    if (!staff.some((s) => s.id === q.staffId)) return [];
    return slotsForStaff(data, q, q.staffId, durationMin);
  }

  const load = new Map<string, number>();
  for (const s of staff) {
    load.set(
      s.id,
      data.busy.filter(
        (b) => b.kind !== 'block' && b.staffId === s.id && localDateOf(b.start, data.rules.timeZone) === q.date,
      ).length,
    );
  }
  const byStart = new Map<number, Slot>();
  for (const s of staff) {
    for (const slot of slotsForStaff(data, q, s.id, durationMin)) {
      const key = slot.start.getTime();
      const current = byStart.get(key);
      if (!current || (load.get(s.id) ?? 0) < (load.get(current.staffId) ?? 0)) byStart.set(key, slot);
    }
  }
  return [...byStart.values()].sort((a, b) => a.start.getTime() - b.start.getTime());
}

/** Fasce della giornata per raggruppare gli slot nell'interfaccia. */
export type DayPart = 'mattina' | 'pomeriggio' | 'sera';
export function dayPart(minutesOfDay: number): DayPart {
  if (minutesOfDay < 13 * 60) return 'mattina';
  if (minutesOfDay < 18 * 60) return 'pomeriggio';
  return 'sera';
}
