/** S09 prenotazione confermata. La spunta compare con una molla (dissolvenza con "riduci movimento"). */
import { useEffect } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { capitalize, formatDateLong, formatTime, localDateOf } from '@bb/core';
import { useMyAppointments, useSalon, useStaff } from '@bb/api';
import { Button, Screen, Text, useTheme } from '@bb/ui';
import { useBooking } from '@/booking-state';

export default function Confirmed() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { reset } = useBooking();
  const salon = useSalon();
  const staff = useStaff();
  const mine = useMyAppointments();
  const appt = mine.data?.find((a) => a.id === id);
  const tz = salon.data?.timezone ?? 'Europe/Rome';
  const reduced = useReducedMotion();
  const p = useSharedValue(0);
  useEffect(() => {
    const s = t.motion.spring.default;
    p.value = reduced ? withTiming(1, { duration: t.motion.reduced.crossfadeMs }) : withSpring(1, { dampingRatio: s.dampingRatio, duration: s.duration });
  }, [p, reduced, t]);
  const anim = useAnimatedStyle(() => ({ opacity: p.value, transform: reduced ? [] : [{ scale: 0.6 + 0.4 * p.value }] }));

  const done = () => {
    reset();
    router.replace('/');
  };
  const who = staff.data?.find((s) => s.id === appt?.staffId);

  return (
    <Screen contentStyle={{ alignItems: 'center', paddingTop: 96, gap: 16 }}>
      <Animated.View style={[{ width: 88, height: 88, borderRadius: 44, backgroundColor: t.c.successTint, alignItems: 'center', justifyContent: 'center' }, anim]}>
        <Text variant="largeTitle" tone="success">✓</Text>
      </Animated.View>
      <Text variant="title1" style={{ textAlign: 'center' }} accessibilityRole="header" testID="confirmed-title">
        Ci vediamo presto!
      </Text>
      {appt ? (
        <View style={{ alignItems: 'center', gap: 4 }}>
          <Text variant="headline" numeric style={{ textAlign: 'center' }}>
            {capitalize(formatDateLong(localDateOf(new Date(appt.startAt), tz)))}, ore {formatTime(new Date(appt.startAt), tz)}
          </Text>
          <Text variant="subhead" tone="muted" style={{ textAlign: 'center' }}>
            {appt.services.map((s) => s.name).join(' + ')}
            {who ? ` con ${who.displayName}` : ''}
          </Text>
          <Text variant="footnote" tone="muted" style={{ textAlign: 'center', marginTop: 8 }}>
            Ti ricorderemo l'appuntamento la sera prima.
          </Text>
        </View>
      ) : null}
      <View style={{ width: '100%', gap: 8, marginTop: 24 }}>
        <Button title="I miei appuntamenti" variant="tinted" onPress={() => { reset(); router.replace('/appuntamenti'); }} />
        <Button title="Torna al salone" variant="ghost" onPress={done} testID="back-home" />
      </View>
    </Screen>
  );
}
