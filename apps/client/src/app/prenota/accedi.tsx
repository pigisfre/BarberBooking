/** S02 accesso come schermata a se (il riepilogo lo mostra in linea per non aggiungere un passaggio). */
import { router } from 'expo-router';
import { Screen } from '@bb/ui';
import { AuthForm } from '@/auth-form';

export default function SignIn() {
  return (
    <Screen>
      <AuthForm intro="Ci servono solo nome e telefono." onDone={() => router.back()} />
    </Screen>
  );
}
