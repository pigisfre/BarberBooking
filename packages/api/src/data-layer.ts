/**
 * L'unico modo in cui le schermate parlano col backend.
 * Due implementazioni con la stessa firma:
 *  - fake (adesso): server locale in memoria con dati di prova, vedi src/fake/
 *  - supabase (replica-backend): RLS + RPC book_appointment + Edge Function availability
 * Cambiare implementazione non deve toccare il codice delle schermate.
 */
import type { LocalDate } from '@bb/core';
import type {
  Appointment,
  AvailableSlot,
  BookInput,
  DayStats,
  Salon,
  Service,
  ServiceCategory,
  Session,
  StaffMember,
  TimeBlock,
  WorkingHoursRow,
} from './types';

export interface DataLayer {
  // pubblico
  getSalon(): Promise<Salon>;
  listCategories(): Promise<ServiceCategory[]>;
  listServices(): Promise<Service[]>;
  listStaff(): Promise<StaffMember[]>;
  listWorkingHours(): Promise<WorkingHoursRow[]>;
  getAvailability(q: { date: LocalDate; serviceIds: string[]; staffId: string | 'any' }): Promise<AvailableSlot[]>;

  // sessione (finta finche non c'e Supabase Auth)
  getSession(): Promise<Session | null>;
  signInCustomer(input: { name: string; phone: string }): Promise<Session>;
  signInStaff(input: { email: string }): Promise<Session>;
  signOut(): Promise<void>;

  // cliente loggato o staff
  /** Lancia BookingError con lo stesso codice di book_appointment(). */
  bookAppointment(input: BookInput): Promise<{ id: string }>;
  listMyAppointments(): Promise<Appointment[]>;
  cancelAppointment(id: string): Promise<void>;

  // staff
  listAppointments(q: { from: string; to: string }): Promise<Appointment[]>;
  listTimeBlocks(q: { from: string; to: string }): Promise<TimeBlock[]>;
  getDayStats(date: LocalDate): Promise<DayStats>;
}
