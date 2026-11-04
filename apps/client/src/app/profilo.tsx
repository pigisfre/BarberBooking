/** S16 profilo: dati, esci, elimina account (obbligatorio per Apple e GDPR). */
import { useState } from 'react';
import { Alert, Platform, View } from 'react-native';
import { router } from 'expo-router';
import { useDeleteAccount, useSession, useSignOut } from '@bb/api';
import { Banner, Button, ListGroup, ListRow, Screen, Text } from '@bb/ui';
import { AuthForm } from '@/auth-form';
import { brand } from '@/config';

function confirmDelete(): Promise<boolean> {
  const msg = 'Cancelliamo il tuo account e i tuoi dati. Gli appuntamenti futuri verranno annullati. Non si può tornare indietro.';
  if (Platform.OS === 'web') return Promise.resolve(globalThis.confirm?.(msg) ?? false);
  return new Promise((resolve) =>
    Alert.alert('Eliminare l’account?', msg, [
      { text: 'Mantieni', style: 'cancel', onPress: () => resolve(false) },
      { text: 'Elimina account', style: 'destructive', onPress: () => resolve(true) },
    ]),
  );
}

export default function Profile() {
  const session = useSession();
  const signOut = useSignOut();
  const del = useDeleteAccount();
  const [error, setError] = useState<string | null>(null);
  if (!session.data) {
    return (
      <Screen>
        <AuthForm intro="Accedi per vedere e gestire i tuoi appuntamenti." />
      </Screen>
    );
  }
  const remove = async () => {
    if (!(await confirmDelete())) return;
    setError(null);
    del.mutate(undefined, { onSuccess: () => router.replace('/'), onError: () => setError('Non siamo riusciti a eliminare l’account. Riprova.') });
  };
  return (
    <Screen>
      <ListGroup>
        <ListRow first title={session.data.name} subtitle={session.data.phone ?? undefined} />
      </ListGroup>
      <Button title="Esci" variant="secondary" onPress={() => signOut.mutate(undefined, { onSuccess: () => router.replace('/') })} />
      <View style={{ marginTop: 32, gap: 8 }}>
        {error ? <Banner tone="danger">{error}</Banner> : null}
        <Button title="Elimina account" variant="ghost" onPress={remove} loading={del.isPending} testID="delete-account" />
      </View>
      <Text variant="footnote" tone="muted" style={{ marginTop: 24 }}>
        {brand.legal?.businessName} · {brand.legal?.supportEmail}
      </Text>
    </Screen>
  );
}
