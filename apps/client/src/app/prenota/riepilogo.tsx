/** S08 riepilogo e conferma. */
import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { BookingError, BOOKING_ERRORS, capitalize, formatDateLong, formatDuration, formatPrice, formatTime, localDateOf, summarize } from '@bb/core';
import { useBook, useSalon, useServices, useSession, useStaff } from '@bb/api';
import { Avatar, Banner, Button, ListGroup, ListRow, Screen, SectionLabel, Text, TextField, haptics } from '@bb/ui';
import { AuthForm } from '@/auth-form';
import { useBooking } from '@/booking-state';

export default function Summary() {
  const { draft, update } = useBooking();
  const salon = useSalon();
  const services = useServices();
  const staff = useStaff();
  const session = useSession();
  const book = useBook();
  const [error, setError] = useState<string | null>(null);
  const tz = salon.data?.timezone ?? 'Europe/Rome';

  if (!draft.slot || !services.data) {
    return (
      <Screen>
        <Text variant="subhead" tone="muted">Nessun orario scelto.</Text>
        <Button title="Torna agli orari" variant="tinted" onPress={() => router.back()} />
      </Screen>
    );
  }
  const slot = draft.slot;
  const chosen = services.data.filter((s) => draft.serviceIds.includes(s.id));
  const { durationMin, totalCents } = summarize(services.data, draft.serviceIds);
  const who = staff.data?.find((s) => s.id === slot.staffId);
  const start = new Date(slot.startAt);
  const loggedIn = !!session.data;

  const confirm = () => {
    setError(null);
    book.mutate(
      { staffId: slot.staffId, serviceIds: draft.serviceIds, startAt: slot.startAt, source: 'app', note: draft.note, idempotencyKey: draft.idempotencyKey },
      {
        onSuccess: ({ id }) => {
          haptics.success();
          router.replace({ pathname: '/prenota/confermato', params: { id } });
        },
        onError: (e) => {
          haptics.warning();
          if (e instanceof BookingError && e.code === 'slot_unavailable') {
            update({ slot: null });
            setError(BOOKING_ERRORS.slot_unavailable);
          } else {
            setError(e instanceof BookingError ? e.message : 'Qualcosa non ha funzionato. Riprova.');
          }
        },
      },
    );
  };

  return (
    <Screen
      footer={
        loggedIn ? (
          <Button size="lg" title="Conferma prenotazione" onPress={confirm} loading={book.isPending} testID="confirm" />
        ) : undefined
      }
    >
      {error ? (
        <View style={{ gap: 8, marginBottom: 8 }}>
          <Banner tone="danger">{error}</Banner>
          <Button title="Scegli un altro orario" variant="tinted" onPress={() => router.back()} />
        </View>
      ) : null}

      <ListGroup>
        <ListRow
          first
          title={`${capitalize(formatDateLong(localDateOf(start, tz)))}`}
          subtitle={`Ore ${formatTime(start, tz)} · ${formatDuration(durationMin)}`}
        />
        {who ? <ListRow title={who.displayName} subtitle="Operatore" left={<Avatar name={who.displayName} colorIndex={who.colorIndex} size={28} />} /> : null}
      </ListGroup>

      <SectionLabel>Servizi</SectionLabel>
      <ListGroup>
        {chosen.map((s, i) => (
          <ListRow key={s.id} first={i === 0} title={s.name} right={<Text variant="body" numeric>{formatPrice(s.priceCents)}</Text>} />
        ))}
        <ListRow title="Totale" right={<Text variant="headline" numeric>{formatPrice(totalCents)}</Text>} />
      </ListGroup>
      <Text variant="footnote" tone="muted" style={{ marginLeft: 16 }}>
        Si paga in salone.
      </Text>

      {loggedIn ? (
        <View style={{ marginTop: 16 }}>
          <TextField label="Note per il salone (facoltative)" value={draft.note} onChangeText={(note) => update({ note })} multiline testID="note" />
        </View>
      ) : (
        <View style={{ marginTop: 16 }}>
          <SectionLabel>I tuoi dati</SectionLabel>
          <AuthForm intro="Ci servono solo nome e telefono. La prossima volta non te li chiederemo." />
        </View>
      )}
    </Screen>
  );
}
