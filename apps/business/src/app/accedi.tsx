/** S21 accesso staff: email + password. Nella demo da portfolio le credenziali sono mostrate qui sotto. */
import { useState } from 'react';
import { TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useSignInStaff } from '@bb/api';
import { Banner, Button, Screen, Text, TextField, useTheme } from '@bb/ui';
import { brand } from '@/config';

export default function StaffSignIn() {
  const t = useTheme();
  const demo = brand.demo;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const signIn = useSignInStaff();
  const submit = () => signIn.mutate({ email, password }, { onSuccess: () => router.replace('/') });
  return (
    <Screen maxWidth={420} contentStyle={{ paddingTop: 96 }}>
      <Text variant="largeTitle" accessibilityRole="header">
        {brand.salonName}
      </Text>
      <Text variant="subhead" tone="muted" style={{ marginBottom: 24 }}>
        Gestionale del salone
      </Text>
      <View style={{ gap: 12 }}>
        <TextField label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoComplete="email" testID="staff-email" />
        <View style={{ gap: 6 }}>
          <Text variant="footnote" tone="muted">Password</Text>
          <TextInput
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="current-password"
            onSubmitEditing={submit}
            accessibilityLabel="Password"
            testID="staff-password"
            style={[t.type.body, { minHeight: 44, borderRadius: t.radius.sm, borderWidth: 1, borderColor: t.c.borderInput, paddingHorizontal: 12, color: t.c.text, backgroundColor: t.c.surface }]}
          />
        </View>
        {signIn.isError ? <Banner tone="danger">Email o password non corrette, oppure l'account non ha accesso al gestionale.</Banner> : null}
        <Button title="Entra" onPress={submit} loading={signIn.isPending} testID="staff-submit" />
        {demo?.staffEmail ? (
          <View style={{ marginTop: 16, gap: 8 }}>
            <Banner tone="info">{`Demo: ${demo.staffEmail} · ${demo.staffPassword ?? ''}`}</Banner>
            <Button
              title="Compila con l'account demo"
              variant="ghost"
              size="sm"
              onPress={() => {
                setEmail(demo.staffEmail ?? '');
                setPassword(demo.staffPassword ?? '');
              }}
              testID="staff-demo-fill"
            />
          </View>
        ) : null}
      </View>
    </Screen>
  );
}
