/**
 * S02 accesso (finto finche non c'e Supabase Auth): nome + telefono.
 * Con replica-backend diventa: Apple / Google / link via email, telefono + codice SMS come alternativa.
 */
import { useState } from 'react';
import { View } from 'react-native';
import { useSignInCustomer } from '@bb/api';
import { Button, TextField, Text } from '@bb/ui';

const PHONE = /^\+?[\d\s]{8,16}$/;

export function AuthForm({ onDone, intro }: { onDone?: () => void; intro?: string }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('+39 ');
  const [touched, setTouched] = useState(false);
  const signIn = useSignInCustomer();
  const nameErr = touched && name.trim().length < 2 ? 'Scrivi nome e cognome.' : null;
  const phoneErr = touched && !PHONE.test(phone.trim()) ? 'Controlla il numero: servono almeno 8 cifre.' : null;

  const submit = () => {
    setTouched(true);
    if (name.trim().length < 2 || !PHONE.test(phone.trim())) return;
    signIn.mutate({ name: name.trim(), phone: phone.trim() }, { onSuccess: () => onDone?.() });
  };

  return (
    <View style={{ gap: 12 }}>
      {intro ? (
        <Text variant="subhead" tone="muted">
          {intro}
        </Text>
      ) : null}
      <TextField label="Nome e cognome" value={name} onChangeText={setName} autoComplete="name" error={nameErr} testID="auth-name" />
      <TextField
        label="Telefono"
        value={phone}
        onChangeText={setPhone}
        keyboardType="phone-pad"
        autoComplete="tel"
        error={phoneErr}
        hint="Serve al salone per avvisarti in caso di imprevisti."
        testID="auth-phone"
      />
      {signIn.isError ? (
        <Text variant="footnote" tone="danger">
          Non siamo riusciti a registrarti. Riprova.
        </Text>
      ) : null}
      <Button title="Continua" variant="tinted" onPress={submit} loading={signIn.isPending} testID="auth-submit" />
    </View>
  );
}
