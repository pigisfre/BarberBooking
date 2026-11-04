/**
 * Codici d'errore della prenotazione: gli stessi che solleva `book_appointment()` nel database
 * (replica/schema.sql). Il data layer finto e quello reale li restituiscono identici.
 */
export const BOOKING_ERRORS = {
  slot_unavailable: 'Questo orario è appena stato preso. Scegline un altro.',
  outside_hours: "L'orario scelto è fuori dall'orario di lavoro.",
  invalid_services: 'Uno dei servizi scelti non è più disponibile.',
  too_late: 'È troppo tardi per prenotare questo orario.',
  too_far: 'Non si può ancora prenotare così avanti.',
  booking_closed: 'Le prenotazioni online sono chiuse in questo momento.',
  auth_required: 'Accedi per prenotare.',
  customer_required: 'Scegli il cliente.',
  salon_not_configured: 'Il salone non è ancora configurato.',
  forbidden: 'Non hai i permessi per questa operazione.',
} as const;

export type BookingErrorCode = keyof typeof BOOKING_ERRORS;

export class BookingError extends Error {
  constructor(public readonly code: BookingErrorCode) {
    super(BOOKING_ERRORS[code]);
    this.name = 'BookingError';
  }
}

export function isBookingErrorCode(x: string): x is BookingErrorCode {
  return x in BOOKING_ERRORS;
}
