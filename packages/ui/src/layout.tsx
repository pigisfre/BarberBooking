import { type ReactNode } from 'react';
import { Platform, ScrollView, View, useWindowDimensions, type StyleProp, type ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from './theme';

export type SizeClass = 'compact' | 'regular' | 'wide';
export function useSizeClass(): SizeClass {
  const { width } = useWindowDimensions();
  const t = useTheme();
  if (width >= t.layout.breakpoints.wide) return 'wide';
  if (width >= t.layout.breakpoints.regular) return 'regular';
  return 'compact';
}

/** Contenitore di pagina scorrevole: gutter dai token, larghezza massima su schermi grandi. */
export function Screen({
  children,
  footer,
  maxWidth = 640,
  contentStyle,
  scroll = true,
}: {
  children: ReactNode;
  footer?: ReactNode;
  maxWidth?: number;
  contentStyle?: StyleProp<ViewStyle>;
  scroll?: boolean;
}) {
  const t = useTheme();
  const size = useSizeClass();
  const gutter = t.layout.gutter[size];
  const inner = (
    <View style={[{ width: '100%', maxWidth, alignSelf: 'center', paddingHorizontal: gutter, paddingTop: 16, paddingBottom: footer ? 140 : 32, gap: 8 }, contentStyle]}>
      {children}
    </View>
  );
  return (
    <View style={{ flex: 1, backgroundColor: t.c.bg }}>
      {scroll ? (
        <ScrollView contentInsetAdjustmentBehavior="automatic" keyboardShouldPersistTaps="handled">
          {inner}
        </ScrollView>
      ) : (
        inner
      )}
      {footer ? <BottomBar maxWidth={maxWidth}>{footer}</BottomBar> : null}
    </View>
  );
}

/** Barra in basso in materiale traslucido (il contenuto scorre sotto). */
export function BottomBar({ children, maxWidth = 640 }: { children: ReactNode; maxWidth?: number }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const m = t.material.chrome;
  const content = (
    <View style={{ width: '100%', maxWidth, alignSelf: 'center', paddingHorizontal: 16, paddingTop: 12, paddingBottom: Math.max(insets.bottom, 16) }}>
      {children}
    </View>
  );
  const edge = { borderTopWidth: 1, borderTopColor: m.edge };
  const pos = { position: 'absolute', left: 0, right: 0, bottom: 0 } as const;
  if (Platform.OS === 'web') {
    return (
      <View style={[pos, edge, { backgroundColor: m.bg, backdropFilter: `blur(${m.blur}px) saturate(${m.saturate * 100}%)` } as ViewStyle]}>{content}</View>
    );
  }
  return (
    <BlurView intensity={80} tint={t.scheme === 'dark' ? 'dark' : 'light'} style={[pos, edge]}>
      {content}
    </BlurView>
  );
}
