/** S10 i miei appuntamenti (+ S11 annulla). */
import { useState } from 'react';
import { Alert, Platform, View } from 'react-native';
import { router } from 'expo-router';
import { BookingError, capitalize, formatDateLong, formatPrice, formatTime, localDateOf } from '@bb/core';
import { useCancel, useMyAppointments, useSalon, useSession, useStaff, type Appointment } from '@bb/api';
import { Banner, Button, EmptyState, ListGroup, Screen, Skeleton, StatusPill, Text, useTheme } from '@bb/ui';
import { AuthForm } from '@/auth-form';

function confirmCancel(msg: string): Promise<boolean> {
  if (Platform.OS === 'web') return Promise.resolve(globalThis.confirm?.(msg) ?? false);
  return new Promise((resolve) =>
    Alert.alert('Annullare l’appuntamento?', msg, [
      { text: 'Mantieni', style: 'cancel', onPress: () => resolve(false) },
      { text: 'Annulla appuntamento', style: 'destructive', onPress: () => resolve(true) },
    ]),
  );
}

function Row({ a, tz, staffName, onCancel, first }: { a: Appointment; tz: string; staffName?: string; onCancel?: () => void; first: boolean }) {
  const t = useTheme();
  const start = new Date(a.startAt);
  return (
    <View style={{ padding: 16, gap: 6, borderTopWidth: first ? 0 : 1, borderTopColor: t.c.border }} testID={`my-appt-${a.id}`}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
        <Text variant="headline" numeric style={{ flex: 1 }}>
          {capitalize(formatDateLong(localDateOf(start, tz)))}, {formatTime(start, tz)}
        </Text>
        <StatusPill status={a.status} />
      </View>
      <Text variant="subhead" tone="muted">
        {a.services.map((s) => s.name).join(' + ')}
        {staffName ? ` · ${staffName}` : ''} · {formatPrice(a.totalCents)}
      </Text>
      {onCancel ? (
        <View style={{ flexDirection: 'row', marginTop: 4 }}>
          <Button title="Annulla" variant="secondary" size="sm" onPress={onCancel} />
        </View>
      ) : null}
    </View>
  );
}

export default function MyAppointments() {
  const session = useSession();
  const mine = useMyAppointments(!!session.data);
  const staff = useStaff();
  const salon = useSalon();
  const cancel = useCancel();
  const [msg, setMsg] = useState<string | null>(null);
  const tz = salon.data?.timezone ?? 'Europe/Rome';

  if (session.isLoading) return <Screen><Skeleton height={80} /></Screen>;
  if (!session.data) {
    return (
      <Screen>
        <AuthForm intro="Accedi con il numero che hai usato per prenotare." />
      </Screen>
    );
  }
  const now = Date.now();
  const list = mine.data ?? [];
  const upcoming = list.filter((a) => new Date(a.endAt).getTime() >= now && a.status !== 'cancelled');
  const past = list.filter((a) => !upcoming.includes(a)).reverse();
  const name = (id: string) => staff.data?.find((s) => s.id === id)?.displayName;

  const ask = async (a: Appointment) => {
    if (!(await confirmCancel('Il posto tornerà libero per altri clienti.'))) return;
    cancel.mutate(a.id, {
      onSuccess: () => setMsg('Appuntamento annullato.'),
      onError: (e) => setMsg(e instanceof BookingError && e.code === 'too_late' ? 'Manca poco all’appuntamento: per annullare chiama il salone.' : 'Non siamo riusciti ad annullare. Riprova.'),
    });
  };

  return (
    <Screen>
      {msg ? <Banner tone="info">{msg}</Banner> : null}
      {mine.isLoading ? (
        <Skeleton height={80} />
      ) : upcoming.length === 0 ? (
        <EmptyState title="Nessun appuntamento in arrivo" message="Quando prenoti, lo trovi qui." action={<Button title="Prenota" onPress={() => router.replace('/')} />} />
      ) : (
        <ListGroup>
          {upcoming.map((a, i) => (
            <Row key={a.id} a={a} tz={tz} staffName={name(a.staffId)} first={i === 0} onCancel={() => ask(a)} />
          ))}
        </ListGroup>
      )}
      {past.length ? (
        <>
          <Text variant="footnote" tone="muted" style={{ textTransform: 'uppercase', marginLeft: 16, marginTop: 16 }}>
            Passati e annullati
          </Text>
          <ListGroup>
            {past.map((a, i) => (
              <Row key={a.id} a={a} tz={tz} staffName={name(a.staffId)} first={i === 0} />
            ))}
          </ListGroup>
        </>
      ) : null}
    </Screen>
  );
}
