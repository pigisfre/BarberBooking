import { useMemo } from 'react';
import { Redirect, Slot, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { DataProvider, useSession } from '@bb/api';
import { Screen, Skeleton, ThemeProvider, useTheme } from '@bb/ui';
import { brand, createDataLayer } from '@/config';
import { Shell } from '@/shell';

/** Solo lo staff entra: senza sessione staff si va all'accesso (S21). */
function Gate() {
  const t = useTheme();
  const path = usePathname();
  const session = useSession();
  const isStaff = !!session.data && session.data.role !== 'customer';
  if (path === '/accedi') return <Slot />;
  if (session.isLoading) {
    return (
      <Screen>
        <Skeleton height={120} />
      </Screen>
    );
  }
  if (!isStaff) return <Redirect href="/accedi" />;
  return (
    <>
      <StatusBar style={t.scheme === 'dark' ? 'light' : 'dark'} />
      <Shell>
        <Slot />
      </Shell>
    </>
  );
}

export default function RootLayout() {
  const layer = useMemo(() => createDataLayer(), []);
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider brand={brand.theme}>
        <DataProvider layer={layer}>
          <Gate />
        </DataProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
