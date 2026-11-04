/**
 * Backend finto in memoria. Riproduce le regole di replica/schema.sql:
 * - book_appointment(): idempotenza, regole del salone, servizi validi per l'operatore,
 *   pause, sovrapposizioni, orario di lavoro, collegamento della scheda cliente per telefono
 * - visibilita: il cliente vede solo i propri appuntamenti, lo staff tutto
 * Serve solo allo sviluppo e ai test end-to-end, finche replica-backend non collega Supabase.
 */
import {
  BookingError,
  addMinutes,
  availableSlots,
  eligibleStaff,
  isoWeekday,
  localDateOf,
  localMinutesOf,
  parseLocalTime,
  summarize,
  zonedToUtc,
  addDays,
  type LocalDate,
  type SlotData,
} from '@bb/core';
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
} from '../types';

export interface Customer {
  id: string;
  profileId: string | null;
  fullName: string;
  phone: string | null;
}

interface Profile {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
}

export interface StoreState {
  salon: Salon;
  categories: ServiceCategory[];
  services: Service[];
  staff: StaffMember[];
  hours: WorkingHoursRow[];
  blocks: TimeBlock[];
  customers: Customer[];
  appointments: Appointment[];
  profiles: Profile[];
  /** userId -> ruolo staff */
  staffUsers: Record<string, 'owner' | 'admin' | 'staff'>;
}

const ACTIVE = new Set(['pending', 'confirmed']);
let counter = 0;
export const newId = (prefix: string) => `${prefix}_${Date.now().toString(36)}${(counter++).toString(36)}`;

export class FakeStore {
  private idempotency = new Map<string, string>();

  constructor(public state: StoreState) {}

  // ------------------------------------------------------------------ helpers
  isStaff(userId: string | null): boolean {
    return !!userId && userId in this.state.staffUsers;
  }

  private slotData(): SlotData {
    const s = this.state;
    return {
      rules: {
        timeZone: s.salon.timezone,
        slotIntervalMin: s.salon.slotIntervalMin,
        minNoticeMin: s.salon.minNoticeMin,
        maxAdvanceDays: s.salon.maxAdvanceDays,
      },
      services: s.services.map((x) => ({ ...x })),
      staff: s.staff.map((x) => ({ ...x })),
      hours: s.hours,
      busy: [
        ...s.appointments
          .filter((a) => ACTIVE.has(a.status))
          .map((a) => ({ staffId: a.staffId, start: new Date(a.startAt), end: new Date(a.endAt) })),
        ...s.blocks.map((b) => ({ staffId: b.staffId, start: new Date(b.startAt), end: new Date(b.endAt) })),
      ],
    };
  }

  session(userId: string | null): Session | null {
    if (!userId) return null;
    const p = this.state.profiles.find((x) => x.id === userId);
    if (!p) return null;
    const role = this.state.staffUsers[userId] ?? 'customer';
    return { userId: p.id, name: p.name, phone: p.phone, email: p.email, role };
  }

  // ------------------------------------------------------------------ pubblico
  publicServices(): Service[] {
    return this.state.services.filter((s) => s.active && s.bookableOnline);
  }

  publicStaff(): StaffMember[] {
    return this.state.staff.filter((s) => s.active && s.bookableOnline);
  }

  availability(
    q: { date: LocalDate; serviceIds: string[]; staffId: string | 'any' },
    now: Date,
    asStaff = false,
  ): AvailableSlot[] {
    return availableSlots(this.slotData(), { ...q, now, asStaff }).map((s) => ({
      startAt: s.start.toISOString(),
      endAt: s.end.toISOString(),
      staffId: s.staffId,
    }));
  }

  // ------------------------------------------------------------------ auth finta
  signInCustomer(name: string, phone: string): Session {
    const normalized = phone.replace(/[^\d+]/g, '');
    let p = this.state.profiles.find((x) => x.phone === normalized);
    if (!p) {
      p = { id: newId('usr'), name: name.trim(), phone: normalized, email: null };
      this.state.profiles.push(p);
    }
    return this.session(p.id)!;
  }

  signInStaff(email: string): Session {
    const p = this.state.profiles.find((x) => x.email?.toLowerCase() === email.trim().toLowerCase());
    if (!p || !this.isStaff(p.id)) throw new BookingError('forbidden');
    return this.session(p.id)!;
  }

  // ------------------------------------------------------------------ prenotazione
  /** Stessa logica e stessi codici d'errore di book_appointment() in replica/schema.sql. */
  book(userId: string | null, input: BookInput, now: Date): { id: string } {
    const prev = this.idempotency.get(input.idempotencyKey);
    if (prev) return { id: prev };

    const s = this.state;
    const salon = s.salon;
    const asStaff = this.isStaff(userId);
    let customerId = input.customerId ?? null;
    const start = new Date(input.startAt);

    if (!asStaff) {
      if (!userId) throw new BookingError('auth_required');
      if (!salon.bookingEnabled) throw new BookingError('booking_closed');
      if (input.source === 'staff') throw new BookingError('forbidden');
      if (start < addMinutes(now, salon.minNoticeMin)) throw new BookingError('too_late');
      if (start > addMinutes(now, salon.maxAdvanceDays * 24 * 60)) throw new BookingError('too_far');
      customerId = this.customerForProfile(userId).id;
    } else if (!customerId) {
      throw new BookingError('customer_required');
    }

    const data = this.slotData();
    const ok = eligibleStaff(data, input.serviceIds, asStaff).some((x) => x.id === input.staffId);
    if (!ok) throw new BookingError('invalid_services');
    const { durationMin, totalCents } = summarize(data.services, input.serviceIds);
    const end = addMinutes(start, durationMin);

    const clash = data.busy.some(
      (b) => (b.staffId === input.staffId || b.staffId === null) && start < b.end && b.start < end,
    );
    if (clash) throw new BookingError('slot_unavailable');

    if (!asStaff) {
      const tz = salon.timezone;
      const date = localDateOf(start, tz);
      const startMin = localMinutesOf(start, tz);
      const endMin = localMinutesOf(end, tz);
      const inHours = s.hours.some(
        (h) =>
          h.staffId === input.staffId &&
          h.weekday === isoWeekday(date) &&
          startMin >= parseLocalTime(h.opens) &&
          endMin <= parseLocalTime(h.closes) &&
          localDateOf(end, tz) === date,
      );
      if (!inHours) throw new BookingError('outside_hours');
    }

    const customer = s.customers.find((c) => c.id === customerId)!;
    const appt: Appointment = {
      id: newId('apt'),
      customerId: customer.id,
      customerName: customer.fullName,
      staffId: input.staffId,
      startAt: start.toISOString(),
      endAt: end.toISOString(),
      status: !asStaff && salon.requiresApproval ? 'pending' : 'confirmed',
      source: input.source,
      customerNote: input.note?.trim() || null,
      totalCents,
      currency: salon.currency,
      services: input.serviceIds.map((id) => {
        const sv = s.services.find((x) => x.id === id)!;
        return { serviceId: sv.id, name: sv.name, durationMin: sv.durationMin, priceCents: sv.priceCents };
      }),
    };
    s.appointments.push(appt);
    this.idempotency.set(input.idempotencyKey, appt.id);
    return { id: appt.id };
  }

  /** Come nel database: scheda gia collegata, oppure stessa scheda per telefono, oppure nuova. */
  private customerForProfile(userId: string): Customer {
    const s = this.state;
    const linked = s.customers.find((c) => c.profileId === userId);
    if (linked) return linked;
    const p = s.profiles.find((x) => x.id === userId)!;
    const byPhone = s.customers.find((c) => c.profileId === null && c.phone && c.phone === p.phone);
    if (byPhone) {
      byPhone.profileId = userId;
      return byPhone;
    }
    const c: Customer = { id: newId('cus'), profileId: userId, fullName: p.name || 'Cliente', phone: p.phone };
    s.customers.push(c);
    return c;
  }

  myAppointments(userId: string | null): Appointment[] {
    if (!userId) throw new BookingError('auth_required');
    const mine = new Set(this.state.customers.filter((c) => c.profileId === userId).map((c) => c.id));
    return this.state.appointments
      .filter((a) => mine.has(a.customerId))
      .sort((a, b) => a.startAt.localeCompare(b.startAt));
  }

  cancel(userId: string | null, id: string, now: Date): void {
    const a = this.state.appointments.find((x) => x.id === id);
    if (!a) throw new BookingError('forbidden');
    if (!this.isStaff(userId)) {
      const mine = this.myAppointments(userId).some((x) => x.id === id);
      if (!mine) throw new BookingError('forbidden');
      if (new Date(a.startAt) < addMinutes(now, this.state.salon.cancelWindowMin)) {
        throw new BookingError('too_late');
      }
    }
    a.status = 'cancelled';
  }

  // ------------------------------------------------------------------ staff
  requireStaff(userId: string | null): void {
    if (!this.isStaff(userId)) throw new BookingError('forbidden');
  }

  appointmentsBetween(from: string, to: string): Appointment[] {
    return this.state.appointments
      .filter((a) => a.startAt < to && a.endAt > from)
      .sort((a, b) => a.startAt.localeCompare(b.startAt));
  }

  blocksBetween(from: string, to: string): TimeBlock[] {
    return this.state.blocks.filter((b) => b.startAt < to && b.endAt > from);
  }

  dayStats(date: LocalDate): DayStats {
    const tz = this.state.salon.timezone;
    const dayRange = (d: LocalDate) => [zonedToUtc(d, 0, tz).toISOString(), zonedToUtc(addDays(d, 1), 0, tz).toISOString()] as const;
    const live = (d: LocalDate) => {
      const [f, t] = dayRange(d);
      return this.appointmentsBetween(f, t).filter((a) => a.status !== 'cancelled');
    };
    const today = live(date);
    const month = date.slice(0, 7);
    return {
      date,
      appointments: today.length,
      expectedCents: today.filter((a) => a.status !== 'no_show').reduce((n, a) => n + a.totalCents, 0),
      noShowsThisMonth: this.state.appointments.filter(
        (a) => a.status === 'no_show' && localDateOf(new Date(a.startAt), tz).startsWith(month),
      ).length,
      sameWeekdayLastWeek: live(addDays(date, -7)).length,
    };
  }
}
