/**
 * Struttura del gestionale: barra laterale su tablet e desktop, barra in basso sul telefono.
 * Voci con nomi specifici (Oggi, Agenda, Clienti...), non generici.
 */
import { type ReactNode } from 'react';
import { View } from 'react-native';
import { router, usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSession, useSignOut } from '@bb/api';
import { BottomBar, PressableScale, Text, useSizeClass, useTheme } from '@bb/ui';
import { brand } from '@/config';

export const NAV = [
  { href: '/', label: 'Oggi' },
  { href: '/agenda', label: 'Agenda' },
  { href: '/clienti', label: 'Clienti' },
  { href: '/servizi', label: 'Servizi' },
  { href: '/staff', label: 'Staff' },
  { href: '/impostazioni', label: 'Impostazioni' },
] as const;
const MOBILE = ['/', '/agenda', '/clienti', '/impostazioni'];

function NavItem({ href, label, active, compact }: { href: string; label: string; active: boolean; compact?: boolean }) {
  const t = useTheme();
  return (
    <PressableScale
      onPress={() => router.navigate(href as never)}
      accessibilityRole="link"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
      testID={`nav-${label.toLowerCase()}`}
      style={
        compact
          ? { flex: 1, alignItems: 'center', paddingVertical: 6 }
          : { height: 36, justifyContent: 'center', paddingHorizontal: 12, borderRadius: t.radius.sm, backgroundColor: active ? t.c.fill : 'transparent' }
      }
    >
      <Text variant={compact ? 'caption' : 'subhead'} style={{ fontWeight: active ? '600' : '400', color: active && compact ? t.c.accentText : t.c.text }}>
        {label}
      </Text>
    </PressableScale>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const t = useTheme();
  const size = useSizeClass();
  const path = usePathname();
  const insets = useSafeAreaInsets();
  const session = useSession();
  const signOut = useSignOut();
  const isActive = (href: string) => (href === '/' ? path === '/' : path.startsWith(href));

  if (size === 'compact') {
    return (
      <View style={{ flex: 1, backgroundColor: t.c.bg, paddingTop: insets.top }}>
        <View style={{ flex: 1 }}>{children}</View>
        <BottomBar maxWidth={10000}>
          <View style={{ flexDirection: 'row' }} accessibilityRole="tablist">
            {NAV.filter((n) => MOBILE.includes(n.href)).map((n) => (
              <NavItem key={n.href} {...n} active={isActive(n.href)} compact />
            ))}
          </View>
        </BottomBar>
      </View>
    );
  }
  return (
    <View style={{ flex: 1, flexDirection: 'row', backgroundColor: t.c.surface }}>
      <View style={{ width: t.layout.sidebar, backgroundColor: t.c.bg, paddingTop: insets.top + 16, paddingHorizontal: 8, gap: 2 }} accessibilityRole="navigation">
        <Text variant="headline" style={{ paddingHorizontal: 12, marginBottom: 12 }} numberOfLines={1}>
          {brand.salonName}
        </Text>
        {NAV.map((n) => (
          <NavItem key={n.href} {...n} active={isActive(n.href)} />
        ))}
        <View style={{ flex: 1 }} />
        <View style={{ paddingHorizontal: 12, paddingBottom: 16, gap: 4 }}>
          <Text variant="footnote" tone="muted" numberOfLines={1}>
            {session.data?.name}
          </Text>
          <PressableScale onPress={() => signOut.mutate(undefined, { onSuccess: () => router.replace('/accedi') })} accessibilityRole="button">
            <Text variant="footnote" tone="accent">Esci</Text>
          </PressableScale>
        </View>
      </View>
      <View style={{ flex: 1, backgroundColor: t.c.bg }}>{children}</View>
    </View>
  );
}
