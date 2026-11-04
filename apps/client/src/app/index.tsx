/** S04 pagina del salone (home dell'app: un solo salone) + S05 scelta dei servizi. */
import { useMemo } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { formatDuration, formatPrice, isoWeekday, localDateOf, parseLocalTime, summarize } from '@bb/core';
import { useCategories, useData, useSalon, useServices, useStaff, type Service } from '@bb/api';
import { Button, Check, EmptyState, ListGroup, ListRow, PressableScale, Screen, SectionLabel, Skeleton, Text, useTheme } from '@bb/ui';
import { useBooking } from '@/booking-state';
import { brand } from '@/config';

function useOpenToday(timeZone: string | undefined) {
  const d = useData();
  const hours = useQuery({ queryKey: ['hours'], queryFn: () => d.listWorkingHours() });
  if (!timeZone || !hours.data) return null;
  const today = isoWeekday(localDateOf(new Date(), timeZone));
  const todays = hours.data.filter((h) => h.weekday === today);
  if (todays.length === 0) return { open: false, label: 'Chiuso oggi' };
  const closes = Math.max(...todays.map((h) => parseLocalTime(h.closes)));
  return { open: true, label: `Aperto oggi fino alle ${Math.floor(closes / 60)}:${String(closes % 60).padStart(2, '0')}` };
}

export default function Home() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const salon = useSalon();
  const services = useServices();
  const categories = useCategories();
  const staff = useStaff();
  const { draft, toggleService, update } = useBooking();
  const openToday = useOpenToday(salon.data?.timezone);

  const grouped = useMemo(() => {
    const list = services.data ?? [];
    const cats = [...(categories.data ?? [])].sort((a, b) => a.sortOrder - b.sortOrder);
    const groups = cats.map((c) => ({ name: c.name, items: list.filter((s) => s.categoryId === c.id) }));
    const other = list.filter((s) => !cats.some((c) => c.id === s.categoryId));
    if (other.length) groups.push({ name: 'Altri servizi', items: other });
    return groups.filter((g) => g.items.length);
  }, [services.data, categories.data]);

  const selection = useMemo(() => {
    if (!services.data || draft.serviceIds.length === 0) return null;
    return summarize(services.data, draft.serviceIds);
  }, [services.data, draft.serviceIds]);

  const next = () => {
    const chosen = (services.data ?? []).filter((s) => draft.serviceIds.includes(s.id));
    const who = (staff.data ?? []).filter((st) => chosen.every((s) => s.staffIds.includes(st.id)));
    if (brand.features?.multiStaff !== false && who.length > 1) {
      router.push('/prenota/operatore');
    } else {
      update({ staffId: who[0]?.id ?? 'any' });
      router.push('/prenota/orario');
    }
  };

  const failed = salon.isError || services.isError;

  return (
    <Screen
      maxWidth={720}
      contentStyle={{ paddingTop: 0 }}
      footer={
        <Button
          size="lg"
          testID="continue-services"
          disabled={!selection}
          title={selection ? `Continua · ${formatDuration(selection.durationMin)} · ${formatPrice(selection.totalCents)}` : 'Scegli almeno un servizio'}
          onPress={next}
        />
      }
    >
      {/* copertina: colore del brand finche il salone non carica una foto */}
      <View style={{ marginHorizontal: -16, backgroundColor: t.c.accent, paddingTop: insets.top + 12, paddingHorizontal: 16, paddingBottom: 20, gap: 48 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }}>
          <PressableScale onPress={() => router.push('/appuntamenti')} accessibilityRole="link" accessibilityLabel="I tuoi appuntamenti" testID="nav-appointments" style={{ paddingVertical: 6, paddingHorizontal: 12, borderRadius: t.radius.pill, backgroundColor: 'rgba(0,0,0,0.12)' }}>
            <Text variant="subhead" tone="onAccent">Appuntamenti</Text>
          </PressableScale>
          <PressableScale onPress={() => router.push('/profilo')} accessibilityRole="link" accessibilityLabel="Profilo" style={{ paddingVertical: 6, paddingHorizontal: 12, borderRadius: t.radius.pill, backgroundColor: 'rgba(0,0,0,0.12)' }}>
            <Text variant="subhead" tone="onAccent">Profilo</Text>
          </PressableScale>
        </View>
        <Text variant="largeTitle" tone="onAccent" accessibilityRole="header" numberOfLines={2}>
          {salon.data?.name ?? brand.salonName}
        </Text>
      </View>

      {failed ? (
        <EmptyState
          title="Non riusciamo a caricare il salone"
          message="Controlla la connessione e riprova."
          action={<Button title="Riprova" variant="tinted" onPress={() => { salon.refetch(); services.refetch(); }} />}
        />
      ) : (
        <>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 12, marginBottom: 8 }}>
            {openToday ? (
              <Text variant="subhead" tone={openToday.open ? 'success' : 'muted'} style={{ fontWeight: '600' }}>
                {openToday.label}
              </Text>
            ) : null}
            {salon.data?.addressLine ? (
              <Text variant="subhead" tone="muted">
                {salon.data.addressLine}
                {salon.data.city ? `, ${salon.data.city}` : ''}
              </Text>
            ) : null}
          </View>
          {salon.data?.description ? (
            <Text variant="subhead" tone="muted" style={{ marginBottom: 8 }}>
              {salon.data.description}
            </Text>
          ) : null}

          {services.isLoading ? (
            <View style={{ gap: 8 }}>
              <Skeleton height={60} />
              <Skeleton height={60} />
              <Skeleton height={60} />
            </View>
          ) : grouped.length === 0 ? (
            <EmptyState title="Nessun servizio prenotabile online" message="Chiama il salone per prenotare." />
          ) : (
            grouped.map((g) => (
              <View key={g.name}>
                <SectionLabel>{g.name}</SectionLabel>
                <ListGroup style={{ marginBottom: 16 }}>
                  {g.items.map((s: Service, i) => {
                    const on = draft.serviceIds.includes(s.id);
                    return (
                      <ListRow
                        key={s.id}
                        first={i === 0}
                        title={s.name}
                        subtitle={`${formatDuration(s.durationMin)} · ${formatPrice(s.priceCents)}`}
                        selected={on}
                        right={<Check on={on} />}
                        onPress={() => toggleService(s.id)}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: on }}
                        testID={`service-${s.id}`}
                      />
                    );
                  })}
                </ListGroup>
              </View>
            ))
          )}
        </>
      )}
    </Screen>
  );
}
