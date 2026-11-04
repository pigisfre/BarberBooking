/** Componenti del flusso di prenotazione: DateStrip, SlotGrid, StaffPicker. */
import { ScrollView, View } from 'react-native';
import { dayOfMonth, dayPart, formatTime, localMinutesOf, weekdayShort, type DayPart, type LocalDate } from '@bb/core';
import { haptics } from './feedback';
import { Avatar, PressableScale, Skeleton, Text } from './primitives';
import { useTheme } from './theme';

export function DateStrip({
  dates,
  selected,
  onSelect,
  unavailable = [],
}: {
  dates: LocalDate[];
  selected: LocalDate | null;
  onSelect: (d: LocalDate) => void;
  unavailable?: LocalDate[];
}) {
  const t = useTheme();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }} accessibilityRole="tablist">
      {dates.map((d) => {
        const on = d === selected;
        const off = unavailable.includes(d);
        return (
          <PressableScale
            key={d}
            onPress={() => {
              haptics.select();
              onSelect(d);
            }}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={`${weekdayShort(d)} ${dayOfMonth(d)}${off ? ', chiuso' : ''}`}
            testID={`day-${d}`}
            style={{
              width: 52,
              height: 64,
              borderRadius: t.radius.md,
              backgroundColor: on ? t.c.accent : t.c.surface,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: off && !on ? 0.45 : 1,
            }}
          >
            <Text variant="footnote" style={{ color: on ? t.c.onAccent : t.c.textMuted }}>
              {weekdayShort(d)}
            </Text>
            <Text variant="title3" numeric style={{ color: on ? t.c.onAccent : t.c.text }}>
              {dayOfMonth(d)}
            </Text>
          </PressableScale>
        );
      })}
    </ScrollView>
  );
}

const PART_LABEL: Record<DayPart, string> = { mattina: 'Mattina', pomeriggio: 'Pomeriggio', sera: 'Sera' };

export function SlotGrid({
  slots,
  timeZone,
  selected,
  onSelect,
  loading,
  columns = 3,
}: {
  slots: { startAt: string; staffId: string }[];
  timeZone: string;
  selected: string | null;
  onSelect: (startAt: string, staffId: string) => void;
  loading?: boolean;
  columns?: number;
}) {
  const t = useTheme();
  if (loading) {
    return (
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {Array.from({ length: 9 }, (_, i) => (
          <Skeleton key={i} style={{ width: `${100 / columns - 3}%` }} />
        ))}
      </View>
    );
  }
  const groups = new Map<DayPart, typeof slots>();
  for (const s of slots) {
    const p = dayPart(localMinutesOf(new Date(s.startAt), timeZone));
    groups.set(p, [...(groups.get(p) ?? []), s]);
  }
  return (
    <View style={{ gap: 16 }}>
      {[...groups.entries()].map(([part, list]) => (
        <View key={part} style={{ gap: 8 }}>
          <Text variant="footnote" tone="muted" style={{ textTransform: 'uppercase', marginLeft: 4 }} accessibilityRole="header">
            {PART_LABEL[part]}
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {list.map((s) => {
              const on = s.startAt === selected;
              const label = formatTime(new Date(s.startAt), timeZone);
              return (
                <PressableScale
                  key={s.startAt}
                  onPress={() => {
                    haptics.select();
                    onSelect(s.startAt, s.staffId);
                  }}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: on }}
                  accessibilityLabel={`Ore ${label}`}
                  testID={`slot-${label}`}
                  style={{
                    flexBasis: `${100 / columns - 3}%`,
                    flexGrow: 1,
                    maxWidth: `${100 / columns - 2}%`,
                    height: 44,
                    borderRadius: t.radius.sm,
                    backgroundColor: on ? t.c.accent : t.c.fill,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text variant="body" numeric style={{ color: on ? t.c.onAccent : t.c.text, fontWeight: on ? '600' : '400' }}>
                    {label}
                  </Text>
                </PressableScale>
              );
            })}
          </View>
        </View>
      ))}
    </View>
  );
}

export function StaffPicker({
  staff,
  selected,
  onSelect,
}: {
  staff: { id: string; displayName: string; colorIndex: number }[];
  selected: string | 'any';
  onSelect: (id: string | 'any') => void;
}) {
  const t = useTheme();
  const options = [{ id: 'any', displayName: 'Primo disponibile', colorIndex: 0 }, ...staff];
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }} accessibilityRole="radiogroup">
      {options.map((s) => {
        const on = s.id === selected;
        return (
          <PressableScale
            key={s.id}
            onPress={() => {
              haptics.select();
              onSelect(s.id);
            }}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            accessibilityLabel={s.displayName}
            testID={`staff-${s.id}`}
            style={{
              width: 96,
              alignItems: 'center',
              gap: 6,
              paddingVertical: 12,
              borderRadius: t.radius.md,
              backgroundColor: on ? t.c.accentTint : t.c.surface,
              borderWidth: 2,
              borderColor: on ? t.c.accent : 'transparent',
            }}
          >
            {s.id === 'any' ? (
              <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: t.c.fill, alignItems: 'center', justifyContent: 'center' }}>
                <Text variant="title3">★</Text>
              </View>
            ) : (
              <Avatar name={s.displayName} colorIndex={s.colorIndex} size={56} />
            )}
            <Text variant="footnote" style={{ textAlign: 'center', fontWeight: on ? '600' : '400', color: on ? t.c.accentText : t.c.text }} numberOfLines={2}>
              {s.displayName}
            </Text>
          </PressableScale>
        );
      })}
    </View>
  );
}
