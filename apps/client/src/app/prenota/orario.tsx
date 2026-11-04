/** S07 giorno e orario. */
import { useEffect, useMemo } from 'react';
import { router } from 'expo-router';
import { addDays, capitalize, formatDateLong, isoWeekday, localDateOf } from '@bb/core';
import { useAvailability, useSalon } from '@bb/api';
import { Button, DateStrip, EmptyState, Screen, SlotGrid, Text, useSizeClass } from '@bb/ui';
import { useQuery } from '@tanstack/react-query';
import { useData } from '@bb/api';
import { useBooking } from '@/booking-state';

export default function ChooseTime() {
  const salon = useSalon();
  const tz = salon.data?.timezone ?? 'Europe/Rome';
  const { draft, update } = useBooking();
  const size = useSizeClass();
  const d = useData();
  const hours = useQuery({ queryKey: ['hours'], queryFn: () => d.listWorkingHours() });

  const days = useMemo(() => {
    const today = localDateOf(new Date(), tz);
    const n = Math.min(salon.data?.maxAdvanceDays ?? 30, 30);
    return Array.from({ length: n + 1 }, (_, i) => addDays(today, i));
  }, [tz, salon.data?.maxAdvanceDays]);

  // giorni in cui nessuno lavora (chiusura settimanale): attenuati ma toccabili
  const closed = useMemo(() => {
    const open = new Set((hours.data ?? []).map((h) => h.weekday));
    return days.filter((x) => !open.has(isoWeekday(x)));
  }, [hours.data, days]);

  useEffect(() => {
    if (!draft.date && hours.data) update({ date: days.find((x) => !closed.includes(x)) ?? days[0]! });
  }, [draft.date, hours.data, days, closed, update]);

  const slots = useAvailability(draft.date, draft.serviceIds, draft.staffId);
  const list = slots.data ?? [];

  return (
    <Screen
      footer={
        <Button
          size="lg"
          testID="continue-time"
          disabled={!draft.slot}
          title={draft.slot ? 'Continua' : 'Scegli un orario'}
          onPress={() => router.push('/prenota/riepilogo')}
        />
      }
    >
      <DateStrip dates={days} selected={draft.date} unavailable={closed} onSelect={(x) => update({ date: x, slot: null })} />
      {draft.date ? (
        <Text variant="title3" style={{ marginTop: 12, marginBottom: 4 }} accessibilityRole="header">
          {capitalize(formatDateLong(draft.date))}
        </Text>
      ) : null}
      {slots.isError ? (
        <EmptyState title="Non riusciamo a caricare gli orari" action={<Button title="Riprova" variant="tinted" onPress={() => slots.refetch()} />} />
      ) : !slots.isLoading && list.length === 0 && draft.date ? (
        <EmptyState
          title="Nessun orario libero"
          message="Prova un altro giorno."
          action={
            <Button
              title="Giorno successivo"
              variant="tinted"
              onPress={() => {
                const i = days.indexOf(draft.date!);
                const next = days.slice(i + 1).find((x) => !closed.includes(x));
                if (next) update({ date: next, slot: null });
              }}
            />
          }
        />
      ) : (
        <SlotGrid
          loading={slots.isLoading || !draft.date}
          slots={list}
          timeZone={tz}
          columns={size === 'compact' ? 3 : 5}
          selected={draft.slot?.startAt ?? null}
          onSelect={(startAt, staffId) => update({ slot: { startAt, staffId } })}
        />
      )}
    </Screen>
  );
}
