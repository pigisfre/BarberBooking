/** Stato del flusso di prenotazione (S05 -> S09), condiviso tra le schermate. */
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { randomUUID } from 'expo-crypto';

export interface BookingDraft {
  serviceIds: string[];
  staffId: string | 'any';
  date: string | null;
  slot: { startAt: string; staffId: string } | null;
  note: string;
  /** una chiave per tentativo: un doppio tap su "Conferma" non crea due appuntamenti */
  idempotencyKey: string;
}

const fresh = (): BookingDraft => ({ serviceIds: [], staffId: 'any', date: null, slot: null, note: '', idempotencyKey: randomUUID() });

interface Ctx {
  draft: BookingDraft;
  update: (p: Partial<BookingDraft>) => void;
  toggleService: (id: string) => void;
  reset: () => void;
}
const BookingCtx = createContext<Ctx | null>(null);

export function BookingProvider({ children }: { children: ReactNode }) {
  const [draft, setDraft] = useState<BookingDraft>(fresh);
  const update = useCallback((p: Partial<BookingDraft>) => setDraft((d) => ({ ...d, ...p })), []);
  const toggleService = useCallback(
    (id: string) =>
      setDraft((d) => ({
        ...d,
        serviceIds: d.serviceIds.includes(id) ? d.serviceIds.filter((x) => x !== id) : [...d.serviceIds, id],
        slot: null, // cambia la durata: l'orario scelto non vale piu
      })),
    [],
  );
  const reset = useCallback(() => setDraft(fresh()), []);
  const value = useMemo(() => ({ draft, update, toggleService, reset }), [draft, update, toggleService, reset]);
  return <BookingCtx.Provider value={value}>{children}</BookingCtx.Provider>;
}

export function useBooking() {
  const c = useContext(BookingCtx);
  if (!c) throw new Error('BookingProvider mancante');
  return c;
}
