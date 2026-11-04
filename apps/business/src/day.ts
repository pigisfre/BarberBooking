import { addDays, zonedToUtc, type LocalDate } from '@bb/core';

/** Intervallo UTC [inizio, fine) di una giornata locale del salone. */
export function dayRange(date: LocalDate, timeZone: string) {
  return { from: zonedToUtc(date, 0, timeZone).toISOString(), to: zonedToUtc(addDays(date, 1), 0, timeZone).toISOString() };
}

export const BLOCK_LABEL = { break: 'Pausa', holiday: 'Ferie', closure: 'Chiuso', other: 'Non disponibile' } as const;
