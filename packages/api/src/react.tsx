/** Collegamento React: il DataLayer arriva dal contesto, le schermate usano questi hook. */
import { createContext, useContext, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { LocalDate } from '@bb/core';
import type { DataLayer } from './data-layer';
import type { BookInput } from './types';

const Ctx = createContext<DataLayer | null>(null);

export function DataProvider({ layer, children }: { layer: DataLayer; children: ReactNode }) {
  const client = useStableQueryClient();
  return (
    <Ctx.Provider value={layer}>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </Ctx.Provider>
  );
}

let sharedClient: QueryClient | null = null;
function useStableQueryClient() {
  sharedClient ??= new QueryClient({
    defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
  });
  return sharedClient;
}

export function useData(): DataLayer {
  const l = useContext(Ctx);
  if (!l) throw new Error('DataProvider mancante');
  return l;
}

export const keys = {
  salon: ['salon'] as const,
  services: ['services'] as const,
  categories: ['categories'] as const,
  staff: ['staff'] as const,
  session: ['session'] as const,
  myAppointments: ['my-appointments'] as const,
  availability: (date: string, serviceIds: string[], staffId: string) => ['availability', date, serviceIds.join(','), staffId] as const,
  appointments: (from: string, to: string) => ['appointments', from, to] as const,
  blocks: (from: string, to: string) => ['blocks', from, to] as const,
  dayStats: (date: string) => ['day-stats', date] as const,
};

export function useSalon() {
  const d = useData();
  return useQuery({ queryKey: keys.salon, queryFn: () => d.getSalon() });
}
export function useServices() {
  const d = useData();
  return useQuery({ queryKey: keys.services, queryFn: () => d.listServices() });
}
export function useCategories() {
  const d = useData();
  return useQuery({ queryKey: keys.categories, queryFn: () => d.listCategories() });
}
export function useStaff() {
  const d = useData();
  return useQuery({ queryKey: keys.staff, queryFn: () => d.listStaff() });
}
export function useSession() {
  const d = useData();
  return useQuery({ queryKey: keys.session, queryFn: () => d.getSession() });
}
export function useAvailability(date: LocalDate | null, serviceIds: string[], staffId: string | 'any') {
  const d = useData();
  return useQuery({
    queryKey: keys.availability(date ?? '', serviceIds, staffId),
    queryFn: () => d.getAvailability({ date: date!, serviceIds, staffId }),
    enabled: !!date && serviceIds.length > 0,
    staleTime: 10_000,
  });
}
export function useMyAppointments(enabled = true) {
  const d = useData();
  return useQuery({ queryKey: keys.myAppointments, queryFn: () => d.listMyAppointments(), enabled });
}
export function useAppointments(from: string, to: string) {
  const d = useData();
  return useQuery({ queryKey: keys.appointments(from, to), queryFn: () => d.listAppointments({ from, to }), refetchInterval: 15_000 });
}
export function useTimeBlocks(from: string, to: string) {
  const d = useData();
  return useQuery({ queryKey: keys.blocks(from, to), queryFn: () => d.listTimeBlocks({ from, to }) });
}
export function useDayStats(date: LocalDate) {
  const d = useData();
  return useQuery({ queryKey: keys.dayStats(date), queryFn: () => d.getDayStats(date), refetchInterval: 30_000 });
}

export function useBook() {
  const d = useData();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: BookInput) => d.bookAppointment(input),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['availability'] });
      qc.invalidateQueries({ queryKey: keys.myAppointments });
      qc.invalidateQueries({ queryKey: ['appointments'] });
    },
  });
}

export function useSignInCustomer() {
  const d = useData();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (i: { name: string; phone: string }) => d.signInCustomer(i),
    onSuccess: (s) => qc.setQueryData(keys.session, s),
  });
}
export function useSignInStaff() {
  const d = useData();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (i: { email: string }) => d.signInStaff(i),
    onSuccess: (s) => qc.setQueryData(keys.session, s),
  });
}
export function useSignOut() {
  const d = useData();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => d.signOut(),
    onSuccess: () => qc.clear(),
  });
}
export function useCancel() {
  const d = useData();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => d.cancelAppointment(id),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: keys.myAppointments });
      qc.invalidateQueries({ queryKey: ['availability'] });
    },
  });
}
