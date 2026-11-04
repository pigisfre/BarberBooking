/** DataLayer che parla col server finto via HTTP. Stessa firma dell'implementazione Supabase. */
import { BookingError, isBookingErrorCode } from '@bb/core';
import type { DataLayer } from '../data-layer';
import type { Session } from '../types';

export interface TokenStorage {
  get(): string | null;
  set(token: string | null): void;
}

/** Sul web la sessione resta tra un ricaricamento e l'altro; su native resta in memoria (basta per lo sviluppo). */
export function defaultTokenStorage(key: string): TokenStorage {
  let mem: string | null = null;
  const ls = typeof globalThis !== 'undefined' ? (globalThis as any).localStorage : undefined;
  return {
    get() {
      try {
        return ls ? ls.getItem(key) : mem;
      } catch {
        return mem;
      }
    },
    set(t) {
      mem = t;
      try {
        if (ls) t ? ls.setItem(key, t) : ls.removeItem(key);
      } catch {
        /* storage non disponibile: resta in memoria */
      }
    },
  };
}

export function createFakeDataLayer(opts: { baseUrl: string; storage: TokenStorage }): DataLayer {
  const { baseUrl, storage } = opts;

  async function rpc<T>(method: string, args: object = {}): Promise<T> {
    const token = storage.get();
    const res = await fetch(`${baseUrl}/rpc/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(args),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      const code = body?.error;
      if (typeof code === 'string' && isBookingErrorCode(code)) throw new BookingError(code);
      throw new Error(`errore del server (${res.status})`);
    }
    return body as T;
  }

  const remember = (s: Session) => {
    storage.set(s.userId);
    return s;
  };

  return {
    getSalon: () => rpc('getSalon'),
    listCategories: () => rpc('listCategories'),
    listServices: () => rpc('listServices'),
    listStaff: () => rpc('listStaff'),
    listWorkingHours: () => rpc('listWorkingHours'),
    getAvailability: (q) => rpc('getAvailability', q),
    getSession: () => (storage.get() ? rpc('getSession') : Promise.resolve(null)),
    signInCustomer: async (i) => remember(await rpc<Session>('signInCustomer', i)),
    signInStaff: async (i) => remember(await rpc<Session>('signInStaff', i)),
    signOut: async () => storage.set(null),
    bookAppointment: (i) => rpc('bookAppointment', i),
    listMyAppointments: () => rpc('listMyAppointments'),
    cancelAppointment: (id) => rpc('cancelAppointment', { id }),
    deleteMyAccount: async () => {
      await rpc('deleteMyAccount');
      storage.set(null);
    },
    listAppointments: (q) => rpc('listAppointments', q),
    listTimeBlocks: (q) => rpc('listTimeBlocks', q),
    getDayStats: (date) => rpc('getDayStats', { date }),
  };
}
