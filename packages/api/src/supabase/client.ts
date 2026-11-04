/**
 * DataLayer su Supabase: RLS per letture e CRUD semplici, RPC per le operazioni critiche
 * (get_available_slots, book_appointment, cancel_appointment, day_stats). Stessa firma del backend finto.
 *
 * Accesso nella demo:
 *  - clienti: "anonymous sign-in" di Supabase + nome e telefono nel profilo (nessun SMS da pagare).
 *    Il telefono NON e verificato: per questo il database non lo usa mai per dare accesso a dati esistenti.
 *    In produzione: OTP via SMS o accesso con Apple / Google / link email.
 *  - staff: email + password.
 */
import { createClient, type SupabaseClient, type SupportedStorage } from '@supabase/supabase-js';
import { BookingError } from '@bb/core';
import type { DataLayer } from '../data-layer';
import type { Session } from '../types';
import { mapAppointment, mapBlock, mapHours, mapSalon, mapService, mapStaff, iso, toAppError } from './map';

export interface SupabaseOptions {
  url: string;
  /** chiave pubblica (publishable / anon): e fatta per stare nell'app */
  publishableKey: string;
  /** native: AsyncStorage; web: lasciare vuoto (usa localStorage) */
  storage?: SupportedStorage;
  /** chiave di archiviazione della sessione, diversa per app cliente e gestionale */
  storageKey: string;
}

function fetchWithTimeout(ms: number): typeof fetch {
  return (input, init) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ms);
    init?.signal?.addEventListener('abort', () => ctrl.abort());
    return fetch(input, { ...init, signal: ctrl.signal }).finally(() => clearTimeout(timer));
  };
}

const APPT_SELECT ='*, appointment_services(*), customers(full_name)';

export function createSupabaseDataLayer(o: SupabaseOptions): DataLayer {
  const sb: SupabaseClient = createClient(o.url, o.publishableKey, {
    // con rete assente o bloccata una richiesta puo restare appesa: dopo 12 s fallisce e l'app mostra "Riprova"
    global: { fetch: fetchWithTimeout(12_000) },
    auth: {
      storage: o.storage,
      storageKey: o.storageKey,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  });

  async function q<T>(p: PromiseLike<{ data: T | null; error: any }>): Promise<T> {
    const { data, error } = await p;
    if (error) throw toAppError(error);
    return data as T;
  }

  async function currentSession(): Promise<Session | null> {
    const { data } = await sb.auth.getSession();
    const user = data.session?.user;
    if (!user) return null;
    const [profile, staff] = await Promise.all([
      sb.from('profiles').select('full_name, phone, email').eq('id', user.id).maybeSingle(),
      sb.from('staff_users').select('role').eq('user_id', user.id).maybeSingle(),
    ]);
    const p = profile.data;
    return {
      userId: user.id,
      name: p?.full_name ?? user.email ?? 'Cliente',
      phone: p?.phone ?? null,
      email: p?.email ?? user.email ?? null,
      role: (staff.data?.role as Session['role']) ?? 'customer',
    };
  }

  return {
    getSalon: async () => mapSalon(await q(sb.from('salon').select('*').single())),
    listCategories: async () =>
      (await q<any[]>(sb.from('service_categories').select('*').order('sort_order'))).map((r) => ({ id: r.id, name: r.name, sortOrder: r.sort_order })),
    listServices: async () => (await q<any[]>(sb.from('services').select('*, service_staff(staff_id)').order('sort_order'))).map(mapService),
    listStaff: async () => (await q<any[]>(sb.from('staff_members').select('*').order('sort_order'))).map(mapStaff),
    listWorkingHours: async () => (await q<any[]>(sb.from('working_hours').select('*'))).map(mapHours),

    getAvailability: async ({ date, serviceIds, staffId }) =>
      (
        await q<any[]>(
          sb.rpc('get_available_slots', { p_service_ids: serviceIds, p_staff_id: staffId === 'any' ? null : staffId, p_day: date }),
        )
      ).map((r) => ({ startAt: iso(r.start_at), endAt: iso(r.end_at), staffId: r.staff_id })),

    getSession: currentSession,

    signInCustomer: async ({ name, phone }) => {
      const existing = (await sb.auth.getSession()).data.session;
      if (!existing) {
        const { error } = await sb.auth.signInAnonymously({ options: { data: { full_name: name } } });
        if (error) throw new Error(error.message);
      }
      const { data } = await sb.auth.getUser();
      if (!data.user) throw new BookingError('auth_required');
      // il profilo lo crea il trigger handle_new_user; qui aggiungiamo nome e telefono
      await q(sb.from('profiles').update({ full_name: name.trim(), phone: phone.replace(/[^\d+]/g, '') }).eq('id', data.user.id));
      return (await currentSession())!;
    },

    signInStaff: async ({ email, password }) => {
      const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password: password ?? '' });
      if (error) throw new BookingError('forbidden');
      const s = await currentSession();
      if (!s || s.role === 'customer') {
        await sb.auth.signOut();
        throw new BookingError('forbidden');
      }
      return s;
    },

    signOut: async () => {
      await sb.auth.signOut();
    },

    bookAppointment: async (i) => {
      const id = await q<string>(
        sb.rpc('book_appointment', {
          p_staff_id: i.staffId,
          p_service_ids: i.serviceIds,
          p_start_at: i.startAt,
          p_customer_id: i.customerId ?? null,
          p_source: i.source,
          p_note: i.note?.trim() || null,
          p_idempotency_key: i.idempotencyKey,
        }),
      );
      return { id };
    },

    listMyAppointments: async () => {
      const { data } = await sb.auth.getSession();
      const uid = data.session?.user.id;
      if (!uid) throw new BookingError('auth_required');
      // filtro esplicito sul proprio profilo: anche se chi chiama e staff, qui servono solo i suoi
      const rows = await q<any[]>(
        sb.from('appointments').select('*, appointment_services(*), customers!inner(full_name, profile_id)').eq('customers.profile_id', uid).order('start_at'),
      );
      return rows.map(mapAppointment);
    },

    cancelAppointment: async (id) => {
      await q(sb.rpc('cancel_appointment', { p_id: id }));
    },

    deleteMyAccount: async () => {
      await q(sb.rpc('delete_my_account'));
      await sb.auth.signOut({ scope: 'local' });
    },

    listAppointments: async ({ from, to }) =>
      (await q<any[]>(sb.from('appointments').select(APPT_SELECT).lt('start_at', to).gt('end_at', from).order('start_at'))).map(mapAppointment),

    listTimeBlocks: async ({ from, to }) =>
      (await q<any[]>(sb.from('time_blocks').select('*').lt('start_at', to).gt('end_at', from))).map(mapBlock),

    getDayStats: async (date) => q(sb.rpc('day_stats', { p_day: date })),
  };
}
