import { describe, expect, it } from 'vitest';
import { BookingError } from '@bb/core';
import { mapAppointment, mapHours, mapService, mapStaff, toAppError } from './map';

describe('righe di Postgres -> tipi delle app', () => {
  it('servizio con operatori abilitati', () => {
    const s = mapService({
      id: 's1', category_id: null, name: 'Taglio', description: null, duration_min: 30, price_cents: 2000,
      currency: 'EUR', bookable_online: true, active: true, sort_order: 0, service_staff: [{ staff_id: 'a' }, { staff_id: 'b' }],
    });
    expect(s.staffIds).toEqual(['a', 'b']);
    expect(s.durationMin).toBe(30);
  });
  it('operatore: colore come indice, con ripiego', () => {
    expect(mapStaff({ id: 'a', display_name: 'Marco', color: '3', sort_order: 0, bookable_online: true, active: true }).colorIndex).toBe(3);
    expect(mapStaff({ id: 'a', display_name: 'Marco', color: null, sort_order: 0, bookable_online: true, active: true }).colorIndex).toBe(1);
  });
  it('orari "09:00:00" -> "09:00"', () => {
    expect(mapHours({ staff_id: 'a', weekday: 2, opens: '09:00:00', closes: '13:00:00' })).toEqual({ staffId: 'a', weekday: 2, opens: '09:00', closes: '13:00' });
  });
  it('appuntamento: istanti in ISO UTC, servizi in ordine, nome del cliente', () => {
    const a = mapAppointment({
      id: 'x', customer_id: 'c', staff_id: 'a', start_at: '2026-11-05T09:45:00+01:00', end_at: '2026-11-05T10:30:00+01:00',
      status: 'confirmed', source: 'app', customer_note: null, total_cents: 3000, currency: 'EUR',
      customers: { full_name: 'Mario Rossi' },
      appointment_services: [
        { service_id: 's2', name: 'Barba', duration_min: 15, price_cents: 1000, position: 2 },
        { service_id: 's1', name: 'Taglio', duration_min: 30, price_cents: 2000, position: 1 },
      ],
    });
    expect(a.startAt).toBe('2026-11-05T08:45:00.000Z');
    expect(a.services.map((s) => s.name)).toEqual(['Taglio', 'Barba']);
    expect(a.customerName).toBe('Mario Rossi');
  });
});

describe('errori di PostgREST -> BookingError', () => {
  it('codice sollevato da una funzione SQL', () => {
    const e = toAppError({ code: 'P0001', message: 'slot_unavailable' });
    expect(e).toBeInstanceOf(BookingError);
    expect((e as BookingError).code).toBe('slot_unavailable');
  });
  it('permesso negato e RLS', () => {
    expect((toAppError({ code: '42501', message: 'permission denied for function book_appointment' }) as BookingError).code).toBe('auth_required');
    expect((toAppError({ code: '42501', message: 'new row violates row-level security policy' }) as BookingError).code).toBe('auth_required');
    expect((toAppError({ message: 'new row violates row-level security policy for table "x"' }) as BookingError).code).toBe('forbidden');
  });
  it('altro: errore generico con il messaggio', () => {
    const e = toAppError({ message: 'connessione persa' });
    expect(e).not.toBeInstanceOf(BookingError);
    expect(e.message).toBe('connessione persa');
  });
});
