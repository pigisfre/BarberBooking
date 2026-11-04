import { useMemo } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { DataProvider } from '@bb/api';
import { ThemeProvider, useTheme } from '@bb/ui';
import { BookingProvider } from '@/booking-state';
import { brand, createDataLayer } from '@/config';

function Navigator() {
  const t = useTheme();
  return (
    <>
      <StatusBar style={t.scheme === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerTintColor: t.c.accentText,
          headerStyle: { backgroundColor: t.c.bg },
          headerTitleStyle: { color: t.c.text },
          headerShadowVisible: false,
          headerBackButtonDisplayMode: 'minimal',
          contentStyle: { backgroundColor: t.c.bg },
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false, title: brand.salonName }} />
        <Stack.Screen name="prenota/operatore" options={{ title: 'Con chi' }} />
        <Stack.Screen name="prenota/orario" options={{ title: 'Quando' }} />
        <Stack.Screen name="prenota/accedi" options={{ title: 'I tuoi dati' }} />
        <Stack.Screen name="prenota/riepilogo" options={{ title: 'Riepilogo' }} />
        <Stack.Screen name="prenota/confermato" options={{ headerShown: false, gestureEnabled: false, title: 'Prenotato' }} />
        <Stack.Screen name="appuntamenti" options={{ title: 'I tuoi appuntamenti' }} />
        <Stack.Screen name="profilo" options={{ title: 'Profilo' }} />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  const layer = useMemo(() => createDataLayer(), []);
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider brand={brand.theme}>
        <DataProvider layer={layer}>
          <BookingProvider>
            <Navigator />
          </BookingProvider>
        </DataProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
