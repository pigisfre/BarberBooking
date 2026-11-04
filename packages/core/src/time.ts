/**
 * Date e ore nel fuso del salone, senza librerie esterne (solo Intl).
 *
 * Regola: gli orari di lavoro sono REGOLE in ora locale ("09:00" il lunedi),
 * gli appuntamenti sono ISTANTI in UTC. Qui si converte tra i due, gestendo l'ora legale.
 */

/** "YYYY-MM-DD" nel calendario locale del salone. */
export type LocalDate = string;
/** "HH:MM" (24h) in ora locale del salone. */
export type LocalTime = string;

const dtfCache = new Map<string, Intl.DateTimeFormat>();
function dtf(timeZone: string): Intl.DateTimeFormat {
  let f = dtfCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    dtfCache.set(timeZone, f);
  }
  return f;
}

interface Parts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function partsOf(instant: Date, timeZone: string): Parts {
  const out: Record<string, number> = {};
  for (const p of dtf(timeZone).formatToParts(instant)) {
    if (p.type !== 'literal') out[p.type] = Number(p.value);
  }
  return out as unknown as Parts;
}

/** Scostamento del fuso rispetto a UTC in minuti, in quell'istante (es. +60 o +120 per Roma). */
export function offsetMinutes(instant: Date, timeZone: string): number {
  const p = partsOf(instant, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - Math.floor(instant.getTime() / 1000) * 1000) / 60000);
}

export function parseLocalDate(d: LocalDate): { y: number; m: number; d: number } {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
  if (!m) throw new Error(`data non valida: ${d}`);
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
}

export function parseLocalTime(t: LocalTime): number {
  const m = /^(\d{2}):(\d{2})(?::\d{2})?$/.exec(t);
  if (!m) throw new Error(`ora non valida: ${t}`);
  return Number(m[1]) * 60 + Number(m[2]);
}

export function formatLocalTime(minutes: number): LocalTime {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Istante UTC corrispondente a una data + ora locali nel fuso dato.
 * Ore che non esistono (salto in avanti dell'ora legale) vengono spostate in avanti, come fa Postgres.
 */
export function zonedToUtc(date: LocalDate, minutesOfDay: number, timeZone: string): Date {
  const { y, m, d } = parseLocalDate(date);
  const naive = Date.UTC(y, m - 1, d, 0, minutesOfDay);
  // due passaggi bastano: l'offset si stabilizza dopo il primo
  let guess = naive - offsetMinutes(new Date(naive), timeZone) * 60000;
  guess = naive - offsetMinutes(new Date(guess), timeZone) * 60000;
  return new Date(guess);
}

/** Data locale ("YYYY-MM-DD") di un istante nel fuso dato. */
export function localDateOf(instant: Date, timeZone: string): LocalDate {
  const p = partsOf(instant, timeZone);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

/** Minuti dalla mezzanotte locale di un istante. */
export function localMinutesOf(instant: Date, timeZone: string): number {
  const p = partsOf(instant, timeZone);
  return p.hour * 60 + p.minute;
}

/** Giorno ISO della settimana di una data locale: 1 = lunedi ... 7 = domenica. */
export function isoWeekday(date: LocalDate): number {
  const { y, m, d } = parseLocalDate(date);
  const w = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = domenica
  return w === 0 ? 7 : w;
}

export function addDays(date: LocalDate, days: number): LocalDate {
  const { y, m, d } = parseLocalDate(date);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return t.toISOString().slice(0, 10);
}

export function addMinutes(instant: Date, minutes: number): Date {
  return new Date(instant.getTime() + minutes * 60000);
}

export function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  // intervalli semiaperti [start, end): uno che finisce alle 10:00 non tocca uno che inizia alle 10:00
  return aStart.getTime() < bEnd.getTime() && bStart.getTime() < aEnd.getTime();
}
