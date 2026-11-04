/** S21 accesso staff (finto: solo email). Con replica-backend: email + password o link via email. */
import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useSignInStaff } from '@bb/api';
import { Button, Screen, Text, TextField } from '@bb/ui';
import { brand } from '@/config';

export default function StaffSignIn() {
  const [email, setEmail] = useState('');
  const signIn = useSignInStaff();
  const submit = () =>
    signIn.mutate({ email }, { onSuccess: () => router.replace('/') });
  return (
    <Screen maxWidth={420} contentStyle={{ paddingTop: 96 }}>
      <Text variant="largeTitle" accessibilityRole="header">
        {brand.salonName}
      </Text>
      <Text variant="subhead" tone="muted" style={{ marginBottom: 24 }}>
        Gestionale del salone
      </Text>
      <View style={{ gap: 12 }}>
        <TextField
          label="Email"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoComplete="email"
          error={signIn.isError ? 'Questa email non ha accesso al gestionale.' : null}
          hint="Dati di prova: titolare@demo.test"
          testID="staff-email"
        />
        <Button title="Entra" onPress={submit} loading={signIn.isPending} testID="staff-submit" />
      </View>
    </Screen>
  );
}
