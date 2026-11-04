/** Formattazione per l'Italia. Numeri pensati per essere mostrati con cifre tabulari. */
import { localMinutesOf, parseLocalDate, type LocalDate } from './time';

const euro = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' });

export function formatPrice(cents: number, currency = 'EUR'): string {
  if (currency === 'EUR') return euro.format(cents / 100);
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency }).format(cents / 100);
}

export function formatDuration(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/** "9:30" (senza zero iniziale, come si scrive in italiano). */
export function formatTime(instant: Date, timeZone: string): string {
  const m = localMinutesOf(instant, timeZone);
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
}

const WEEKDAY_SHORT = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'];
const WEEKDAY_LONG = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];
const MONTH_LONG = [
  'gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno',
  'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre',
];

function dow(date: LocalDate): number {
  const { y, m, d } = parseLocalDate(date);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function weekdayShort(date: LocalDate): string {
  return WEEKDAY_SHORT[dow(date)]!;
}

export function dayOfMonth(date: LocalDate): number {
  return parseLocalDate(date).d;
}

/** "mercoledì 11 novembre" */
export function formatDateLong(date: LocalDate): string {
  const { m, d } = parseLocalDate(date);
  return `${WEEKDAY_LONG[dow(date)]} ${d} ${MONTH_LONG[m - 1]}`;
}

export function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
