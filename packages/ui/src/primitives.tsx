/**
 * Primitivi (replica/design/components.md). Regole:
 * - feedback alla PRESSIONE (onPressIn): scala 0.97 subito, ritorno con molla "snappy"
 * - animazioni interrompibili (molle Reanimated dal valore attuale)
 * - riduci movimento: niente scala, solo opacita
 * - solo token dal tema
 */
import { type ReactNode } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  Text as RNText,
  TextInput,
  View,
  type PressableProps,
  type StyleProp,
  type TextProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring } from 'react-native-reanimated';
import { useTheme, type TypeVariant } from './theme';

const continuous = Platform.OS === 'ios' ? ({ borderCurve: 'continuous' } as const) : {};

// ---------------------------------------------------------------- Text
export function Text({
  variant = 'body',
  tone = 'text',
  numeric,
  style,
  ...rest
}: TextProps & { variant?: TypeVariant; tone?: 'text' | 'muted' | 'accent' | 'danger' | 'success' | 'warning' | 'onAccent'; numeric?: boolean }) {
  const t = useTheme();
  const color = {
    text: t.c.text,
    muted: t.c.textMuted,
    accent: t.c.accentText,
    danger: t.c.danger,
    success: t.c.success,
    warning: t.c.warning,
    onAccent: t.c.onAccent,
  }[tone];
  return (
    <RNText
      {...rest}
      style={[t.type[variant], { color }, numeric && { fontVariant: ['tabular-nums'] }, style]}
      maxFontSizeMultiplier={2}
    />
  );
}

// ---------------------------------------------------------------- PressableScale
export function PressableScale({
  children,
  style,
  disabled,
  onPressIn,
  onPressOut,
  scaleTo = 0.97,
  ...rest
}: PressableProps & { style?: StyleProp<ViewStyle>; children: ReactNode; scaleTo?: number }) {
  const t = useTheme();
  const reduced = useReducedMotion();
  const pressed = useSharedValue(0);
  const spring = t.motion.spring.snappy;
  const anim = useAnimatedStyle(() =>
    reduced
      ? { opacity: 1 - pressed.value * 0.15 }
      : { transform: [{ scale: 1 - pressed.value * (1 - scaleTo) }], opacity: 1 - pressed.value * 0.08 },
  );
  // lo stile (anche di layout: flexBasis, width...) sta sullo stesso elemento che riceve il tocco
  return (
    <AnimatedPressable
      {...rest}
      disabled={disabled}
      hitSlop={10}
      onPressIn={(e) => {
        pressed.value = 1; // istantaneo: il feedback arriva alla pressione
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        pressed.value = withSpring(0, { dampingRatio: spring.dampingRatio, duration: spring.duration });
        onPressOut?.(e);
      }}
      style={[style, anim, disabled && { opacity: 0.4 }]}
    >
      {children}
    </AnimatedPressable>
  );
}
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// ---------------------------------------------------------------- Button
type ButtonVariant = 'primary' | 'secondary' | 'tinted' | 'ghost' | 'danger';
export function Button({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  loading,
  disabled,
  icon,
  accessibilityLabel,
  testID,
  style,
}: {
  title: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  disabled?: boolean;
  icon?: ReactNode;
  accessibilityLabel?: string;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  const bg = { primary: t.c.accent, secondary: t.c.fill, tinted: t.c.accentTint, ghost: 'transparent', danger: t.c.danger }[variant];
  const fg = { primary: t.c.onAccent, secondary: t.c.text, tinted: t.c.accentText, ghost: t.c.accentText, danger: t.c.onDanger }[variant];
  const height = { sm: 32, md: 44, lg: 52 }[size];
  return (
    <PressableScale
      onPress={loading ? undefined : onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: !!disabled, busy: !!loading }}
      testID={testID}
      style={[
        {
          height,
          paddingHorizontal: size === 'sm' ? 12 : 16,
          borderRadius: size === 'lg' ? t.radius.md : t.radius.sm,
          backgroundColor: bg,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          ...continuous,
        },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={fg} /> : icon}
      <Text variant={size === 'sm' ? 'subhead' : 'headline'} style={{ color: fg }} numeric>
        {title}
      </Text>
    </PressableScale>
  );
}

// ---------------------------------------------------------------- liste raggruppate
export function SectionLabel({ children }: { children: string }) {
  return (
    <Text variant="footnote" tone="muted" style={{ textTransform: 'uppercase', marginLeft: 16, marginBottom: 8, marginTop: 8 }} accessibilityRole="header">
      {children}
    </Text>
  );
}

export function ListGroup({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  return <View style={[{ backgroundColor: t.c.surface, borderRadius: t.radius.md, overflow: 'hidden', ...continuous }, style]}>{children}</View>;
}

export function ListRow({
  title,
  subtitle,
  left,
  right,
  onPress,
  selected,
  first,
  accessibilityRole = onPress ? 'button' : undefined,
  accessibilityState,
  testID,
}: {
  title: string;
  subtitle?: string;
  left?: ReactNode;
  right?: ReactNode;
  onPress?: () => void;
  selected?: boolean;
  first?: boolean;
  accessibilityRole?: 'button' | 'checkbox' | 'radio';
  accessibilityState?: { checked?: boolean; selected?: boolean };
  testID?: string;
}) {
  const t = useTheme();
  const body = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, minHeight: 44, backgroundColor: selected ? t.c.accentTint : undefined }}>
      {!first && <View style={{ position: 'absolute', top: 0, left: 16, right: 0, height: 1, backgroundColor: t.c.border }} />}
      {left}
      <View style={{ flex: 1 }}>
        <Text variant="headline">{title}</Text>
        {subtitle ? (
          <Text variant="subhead" tone="muted" numeric>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
    </View>
  );
  if (!onPress) return body;
  return (
    <PressableScale onPress={onPress} scaleTo={0.99} accessibilityRole={accessibilityRole} accessibilityState={accessibilityState} accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title} testID={testID}>
      {body}
    </PressableScale>
  );
}

export function Check({ on }: { on: boolean }) {
  const t = useTheme();
  return (
    <View
      style={{
        width: 24,
        height: 24,
        borderRadius: 12,
        borderWidth: on ? 0 : 1.5,
        borderColor: t.c.borderInput,
        backgroundColor: on ? t.c.accent : 'transparent',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {on ? <Text variant="footnote" style={{ color: t.c.onAccent, fontWeight: '700' }}>✓</Text> : null}
    </View>
  );
}

// ---------------------------------------------------------------- Avatar, pill, vuoti, scheletri
export function Avatar({ name, colorIndex, size = 40 }: { name: string; colorIndex: number; size?: number }) {
  const t = useTheme();
  const s = t.staff(colorIndex);
  const initials = name.split(/\s+/).map((p) => p[0]).join('').slice(0, 2).toUpperCase();
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: s.bg, alignItems: 'center', justifyContent: 'center' }} accessibilityElementsHidden importantForAccessibility="no">
      <Text variant={size >= 56 ? 'title3' : 'caption'} style={{ color: s.ink, fontWeight: '600' }}>
        {initials}
      </Text>
    </View>
  );
}

export type StatusKind = 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'no_show';
export const STATUS_LABEL: Record<StatusKind, string> = {
  confirmed: 'Confermato',
  pending: 'Da confermare',
  completed: 'Completato',
  no_show: 'Non presentato',
  cancelled: 'Annullato',
};
export function StatusPill({ status }: { status: StatusKind }) {
  const t = useTheme();
  const map = {
    confirmed: [t.c.accentTint, t.c.accentText],
    pending: [t.c.warningTint, t.c.warning],
    completed: [t.c.successTint, t.c.success],
    no_show: [t.c.dangerTint, t.c.danger],
    cancelled: [t.c.fill, t.c.textMuted],
  } as const;
  const [bg, fg] = map[status];
  return (
    <View style={{ backgroundColor: bg, borderRadius: t.radius.pill, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start' }}>
      <Text variant="caption" style={{ color: fg, fontWeight: '600', textDecorationLine: status === 'cancelled' ? 'line-through' : 'none' }}>
        {STATUS_LABEL[status]}
      </Text>
    </View>
  );
}

export function EmptyState({ title, message, action }: { title: string; message?: string; action?: ReactNode }) {
  return (
    <View style={{ alignItems: 'center', paddingVertical: 40, paddingHorizontal: 24, gap: 8 }}>
      <Text variant="title3" style={{ textAlign: 'center' }}>
        {title}
      </Text>
      {message ? (
        <Text variant="subhead" tone="muted" style={{ textAlign: 'center' }}>
          {message}
        </Text>
      ) : null}
      {action ? <View style={{ marginTop: 8 }}>{action}</View> : null}
    </View>
  );
}

export function Skeleton({ height = 44, width, radius, style }: { height?: number; width?: number | `${number}%`; radius?: number; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  return <View style={[{ height, width: width ?? '100%', borderRadius: radius ?? t.radius.sm, backgroundColor: t.c.fill }, style]} accessibilityLabel="Caricamento" />;
}

export function Banner({ tone = 'warning', children }: { tone?: 'warning' | 'danger' | 'info'; children: string }) {
  const t = useTheme();
  const [bg, fg] = { warning: [t.c.warningTint, t.c.warning], danger: [t.c.dangerTint, t.c.danger], info: [t.c.accentTint, t.c.accentText] }[tone];
  return (
    <View style={{ backgroundColor: bg, borderRadius: t.radius.sm, padding: 12 }} accessibilityLiveRegion="polite" accessibilityRole="alert">
      <Text variant="subhead" style={{ color: fg }}>
        {children}
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------- campi
export function TextField({
  label,
  value,
  onChangeText,
  error,
  hint,
  keyboardType,
  autoComplete,
  placeholder,
  testID,
  multiline,
}: {
  label: string;
  value: string;
  onChangeText: (s: string) => void;
  error?: string | null;
  hint?: string;
  keyboardType?: 'default' | 'phone-pad' | 'email-address';
  autoComplete?: 'name' | 'tel' | 'email' | 'off';
  placeholder?: string;
  testID?: string;
  multiline?: boolean;
}) {
  const t = useTheme();
  return (
    <View style={{ gap: 6 }}>
      <Text variant="footnote" tone="muted" nativeID={`${testID}-label`}>
        {label}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        autoComplete={autoComplete}
        placeholder={placeholder}
        placeholderTextColor={t.c.textMuted}
        accessibilityLabel={label}
        aria-labelledby={`${testID}-label`}
        testID={testID}
        multiline={multiline}
        style={[
          t.type.body,
          {
            minHeight: multiline ? 88 : 44,
            borderRadius: t.radius.sm,
            borderWidth: 1,
            borderColor: error ? t.c.danger : t.c.borderInput,
            paddingHorizontal: 12,
            paddingVertical: multiline ? 10 : 0,
            color: t.c.text,
            backgroundColor: t.c.surface,
            textAlignVertical: multiline ? 'top' : 'center',
          } as TextStyle,
        ]}
      />
      {error ? (
        <Text variant="footnote" tone="danger" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : hint ? (
        <Text variant="footnote" tone="muted">
          {hint}
        </Text>
      ) : null}
    </View>
  );
}
