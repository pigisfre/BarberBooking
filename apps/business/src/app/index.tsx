/** S22 Oggi: la dashboard centrale del barbiere. */
import { View } from 'react-native';
import { router } from 'expo-router';
import { capitalize, formatDateLong, formatPrice, formatTime, localDateOf } from '@bb/core';
import { useAppointments, useDayStats, useSalon, useStaff } from '@bb/api';
import { Avatar, Button, EmptyState, ListGroup, Screen, Skeleton, StatTile, StatusPill, Text, useTheme } from '@bb/ui';
import { dayRange } from '@/day';

export default function Today() {
  const t = useTheme();
  const salon = useSalon();
  const tz = salon.data?.timezone ?? 'Europe/Rome';
  const today = localDateOf(new Date(), tz);
  const stats = useDayStats(today);
  const { from, to } = dayRange(today, tz);
  const appts = useAppointments(from, to);
  const staff = useStaff();
  const now = Date.now();
  const next = (appts.data ?? []).filter((a) => a.status !== 'cancelled' && new Date(a.endAt).getTime() >= now).slice(0, 6);
  const diff = stats.data ? stats.data.appointments - stats.data.sameWeekdayLastWeek : 0;

  return (
    <Screen maxWidth={1100} contentStyle={{ gap: 16 }}>
      <Text variant="largeTitle" accessibilityRole="header">
        {capitalize(formatDateLong(today))}
      </Text>
      {stats.isLoading ? (
        <Skeleton height={110} />
      ) : stats.data ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
          <StatTile
            label="Appuntamenti oggi"
            value={String(stats.data.appointments)}
            delta={diff === 0 ? 'come la settimana scorsa' : `${Math.abs(diff)} ${diff > 0 ? 'in più' : 'in meno'} della settimana scorsa`}
            deltaTone={diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat'}
          />
          <StatTile label="Incasso previsto" value={formatPrice(stats.data.expectedCents)} />
          <StatTile label="Clienti non presentati, questo mese" value={String(stats.data.noShowsThisMonth)} />
        </View>
      ) : null}

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
        <Text variant="title3" accessibilityRole="header">Prossimi clienti</Text>
        <Button title="Apri agenda" variant="tinted" size="sm" onPress={() => router.navigate('/agenda')} />
      </View>
      {appts.isLoading ? (
        <Skeleton height={160} />
      ) : next.length === 0 ? (
        <EmptyState title="Nessun altro cliente oggi" message="Le nuove prenotazioni compaiono qui appena arrivano." />
      ) : (
        <ListGroup>
          {next.map((a, i) => {
            const s = staff.data?.find((x) => x.id === a.staffId);
            return (
              <View key={a.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, paddingHorizontal: 16, borderTopWidth: i ? 1 : 0, borderTopColor: t.c.border }} testID={`next-${a.id}`}>
                <Text variant="headline" numeric style={{ width: 52 }}>
                  {formatTime(new Date(a.startAt), tz)}
                </Text>
                {s ? <Avatar name={s.displayName} colorIndex={s.colorIndex} size={28} /> : null}
                <View style={{ flex: 1 }}>
                  <Text variant="headline" numberOfLines={1}>{a.customerName}</Text>
                  <Text variant="subhead" tone="muted" numberOfLines={1}>
                    {a.services.map((x) => x.name).join(' + ')}
                    {s ? ` · ${s.displayName}` : ''}
                  </Text>
                </View>
                <StatusPill status={a.status} />
              </View>
            );
          })}
        </ListGroup>
      )}
    </Screen>
  );
}
