/**
 * Traduzione tra le righe di Postgres (snake_case) e i tipi delle app (camelCase),
 * e tra gli errori di PostgREST e i BookingError. Funzioni pure: testate in map.test.ts.
 */
import { BookingError, isBookingErrorCode } from '@bb/core';
import type { Appointment, Salon, Service, StaffMember, TimeBlock, WorkingHoursRow } from '../types';

type Row = Record<string, any>;

export const mapSalon = (r: Row): Salon => ({
  name: r.name,
  phone: r.phone ?? null,
  email: r.email ?? null,
  addressLine: r.address_line ?? null,
  city: r.city ?? null,
  postalCode: r.postal_code ?? null,
  timezone: r.timezone,
  currency: r.currency,
  description: r.description ?? null,
  instagramUrl: r.instagram_url ?? null,
  bookingEnabled: r.booking_enabled,
  slotIntervalMin: r.slot_interval_min,
  minNoticeMin: r.min_notice_min,
  maxAdvanceDays: r.max_advance_days,
  cancelWindowMin: r.cancel_window_min,
  requiresApproval: r.requires_approval,
});

export const mapService = (r: Row): Service => ({
  id: r.id,
  categoryId: r.category_id ?? null,
  name: r.name,
  description: r.description ?? null,
  durationMin: r.duration_min,
  priceCents: r.price_cents,
  currency: r.currency,
  bookableOnline: r.bookable_online,
  active: r.active,
  sortOrder: r.sort_order,
  staffIds: (r.service_staff ?? []).map((x: Row) => x.staff_id),
});

export const mapStaff = (r: Row): StaffMember => ({
  id: r.id,
  displayName: r.display_name,
  avatarUrl: r.avatar_path ?? null,
  colorIndex: Number.parseInt(r.color ?? '1', 10) || 1,
  sortOrder: r.sort_order,
  bookableOnline: r.bookable_online,
  active: r.active,
});

const hhmm = (t: string) => t.slice(0, 5); // "09:00:00" -> "09:00"
export const mapHours = (r: Row): WorkingHoursRow => ({ staffId: r.staff_id, weekday: r.weekday, opens: hhmm(r.opens), closes: hhmm(r.closes) });

/** PostgREST restituisce "2026-11-05T08:45:00+00:00": lo normalizziamo in ISO con Z, come il backend finto. */
export const iso = (t: string) => new Date(t).toISOString();

export const mapAppointment = (r: Row): Appointment => ({
  id: r.id,
  customerId: r.customer_id,
  customerName: r.customers?.full_name ?? 'Cliente',
  staffId: r.staff_id,
  startAt: iso(r.start_at),
  endAt: iso(r.end_at),
  status: r.status,
  source: r.source,
  customerNote: r.customer_note ?? null,
  totalCents: r.total_cents,
  currency: r.currency,
  services: [...(r.appointment_services ?? [])]
    .sort((a: Row, b: Row) => a.position - b.position)
    .map((s: Row) => ({ serviceId: s.service_id ?? null, name: s.name, durationMin: s.duration_min, priceCents: s.price_cents })),
});

export const mapBlock = (r: Row): TimeBlock => ({
  id: r.id,
  staffId: r.staff_id ?? null,
  startAt: iso(r.start_at),
  endAt: iso(r.end_at),
  reason: r.reason,
  note: r.note ?? null,
});

/**
 * Le funzioni SQL sollevano `raise exception 'slot_unavailable'`: PostgREST lo restituisce come
 * { code: 'P0001', message: 'slot_unavailable' }. Lo trasformiamo nello stesso BookingError del backend finto.
 * "permission denied" (funzione non concessa, es. anonimo) diventa auth_required.
 */
export function toAppError(err: { message?: string; code?: string } | null | undefined): Error {
  const msg = (err?.message ?? '').trim();
  if (isBookingErrorCode(msg)) return new BookingError(msg);
  if (err?.code === '42501' || /permission denied/i.test(msg)) return new BookingError('auth_required');
  if (/row-level security/i.test(msg)) return new BookingError('forbidden');
  return new Error(msg || 'Errore del server');
}
