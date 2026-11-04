/** S23 agenda del giorno, una colonna per operatore (sola lettura nella vertical slice). */
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { addDays, capitalize, formatDateLong, localDateOf } from '@bb/core';
import { useAppointments, useSalon, useStaff, useTimeBlocks } from '@bb/api';
import { AgendaGrid, Button, DateStrip, Screen, Skeleton, Text, useSizeClass, useTheme } from '@bb/ui';
import { BLOCK_LABEL, dayRange } from '@/day';

export default function Agenda() {
  const t = useTheme();
  const salon = useSalon();
  const tz = salon.data?.timezone ?? 'Europe/Rome';
  const today = localDateOf(new Date(), tz);
  const [date, setDate] = useState(today);
  const size = useSizeClass();
  const staff = useStaff();
  const { from, to } = dayRange(date, tz);
  const appts = useAppointments(from, to);
  const blocks = useTimeBlocks(from, to);
  const days = useMemo(() => Array.from({ length: 21 }, (_, i) => addDays(today, i - 3)), [today]);
  const [staffIdx, setStaffIdx] = useState(0);
  const all = (staff.data ?? []).filter((s) => s.active);
  // sul telefono un operatore alla volta
  const visible = size === 'compact' ? all.slice(staffIdx, staffIdx + 1) : all;

  return (
    <Screen maxWidth={1400} contentStyle={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <Text variant="title1" accessibilityRole="header" testID="agenda-title">
          {capitalize(formatDateLong(date))}
        </Text>
        {date !== today ? <Button title="Oggi" variant="tinted" size="sm" onPress={() => setDate(today)} /> : null}
      </View>
      <DateStrip dates={days} selected={date} onSelect={setDate} />
      {size === 'compact' && all.length > 1 ? (
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          {all.map((s, i) => (
            <Button key={s.id} title={s.displayName} size="sm" variant={i === staffIdx ? 'primary' : 'secondary'} onPress={() => setStaffIdx(i)} />
          ))}
        </View>
      ) : null}
      {staff.isLoading || appts.isLoading ? (
        <Skeleton height={400} radius={t.radius.md} />
      ) : (
        <AgendaGrid
          staff={visible}
          timeZone={tz}
          showNow={date === today}
          items={(appts.data ?? []).map((a) => ({
            id: a.id,
            staffId: a.staffId,
            startAt: a.startAt,
            endAt: a.endAt,
            title: a.customerName,
            subtitle: a.services.map((s) => s.name).join(' + '),
            status: a.status,
          }))}
          blocks={(blocks.data ?? []).map((b) => ({ id: b.id, staffId: b.staffId, startAt: b.startAt, endAt: b.endAt, label: b.note ?? BLOCK_LABEL[b.reason] }))}
        />
      )}
    </Screen>
  );
}
