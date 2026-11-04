/** S16 profilo (minimo per la vertical slice: dati, esci). Elimina account arriva con replica-backend. */
import { router } from 'expo-router';
import { useSession, useSignOut } from '@bb/api';
import { Button, ListGroup, ListRow, Screen, Text } from '@bb/ui';
import { AuthForm } from '@/auth-form';
import { brand } from '@/config';

export default function Profile() {
  const session = useSession();
  const signOut = useSignOut();
  if (!session.data) {
    return (
      <Screen>
        <AuthForm intro="Accedi per vedere e gestire i tuoi appuntamenti." />
      </Screen>
    );
  }
  return (
    <Screen>
      <ListGroup>
        <ListRow first title={session.data.name} subtitle={session.data.phone ?? undefined} />
      </ListGroup>
      <Button title="Esci" variant="secondary" onPress={() => signOut.mutate(undefined, { onSuccess: () => router.replace('/') })} />
      <Text variant="footnote" tone="muted" style={{ marginTop: 24 }}>
        {brand.legal?.businessName} · {brand.legal?.supportEmail}
      </Text>
    </Screen>
  );
}
