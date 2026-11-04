/**
 * Tipi condivisi dalle app. Rispecchiano le tabelle di replica/schema.sql, in camelCase.
 * Gli istanti viaggiano come stringhe ISO in UTC.
 */
import type { LocalDate, LocalTime } from '@bb/core';

export type ISODateTime = string;

export interface Salon {
  name: string;
  phone: string | null;
  email: string | null;
  addressLine: string | null;
  city: string | null;
  postalCode: string | null;
  timezone: string;
  currency: string;
  description: string | null;
  instagramUrl: string | null;
  bookingEnabled: boolean;
  slotIntervalMin: number;
  minNoticeMin: number;
  maxAdvanceDays: number;
  cancelWindowMin: number;
  requiresApproval: boolean;
}

export interface ServiceCategory {
  id: string;
  name: string;
  sortOrder: number;
}

export interface Service {
  id: string;
  categoryId: string | null;
  name: string;
  description: string | null;
  durationMin: number;
  priceCents: number;
  currency: string;
  bookableOnline: boolean;
  active: boolean;
  sortOrder: number;
  staffIds: string[];
}

export interface StaffMember {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  /** 1..6: colore della colonna in agenda (token staff-N) */
  colorIndex: number;
  sortOrder: number;
  bookableOnline: boolean;
  active: boolean;
}

export interface WorkingHoursRow {
  staffId: string;
  weekday: number;
  opens: LocalTime;
  closes: LocalTime;
}

export type AppointmentStatus = 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'no_show';
export type AppointmentSource = 'app' | 'web' | 'staff';

export interface AppointmentLine {
  serviceId: string | null;
  name: string;
  durationMin: number;
  priceCents: number;
}

export interface Appointment {
  id: string;
  customerId: string;
  customerName: string;
  staffId: string;
  startAt: ISODateTime;
  endAt: ISODateTime;
  status: AppointmentStatus;
  source: AppointmentSource;
  customerNote: string | null;
  totalCents: number;
  currency: string;
  services: AppointmentLine[];
}

export interface TimeBlock {
  id: string;
  staffId: string | null;
  startAt: ISODateTime;
  endAt: ISODateTime;
  reason: 'break' | 'holiday' | 'closure' | 'other';
  note: string | null;
}

export interface AvailableSlot {
  startAt: ISODateTime;
  endAt: ISODateTime;
  staffId: string;
}

export interface Session {
  userId: string;
  name: string;
  phone: string | null;
  email: string | null;
  role: 'customer' | 'owner' | 'admin' | 'staff';
}

export interface BookInput {
  staffId: string;
  serviceIds: string[];
  startAt: ISODateTime;
  /** solo staff: per quale cliente */
  customerId?: string;
  source: AppointmentSource;
  note?: string;
  idempotencyKey: string;
}

export interface DayStats {
  date: LocalDate;
  appointments: number;
  expectedCents: number;
  noShowsThisMonth: number;
  sameWeekdayLastWeek: number;
}
