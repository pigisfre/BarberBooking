/**
 * AgendaGrid in sola lettura (vertical slice). Trascinamento e allungamento arrivano nella fase "agenda completa".
 * Colonna oraria + una colonna per operatore, 64 pt per ora, linea dell'ora attuale.
 */
import { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { formatTime, localMinutesOf } from '@bb/core';
import { Avatar, STATUS_LABEL, Text, type StatusKind } from './primitives';
import { useTheme } from './theme';

export interface AgendaItem {
  id: string;
  staffId: string;
  startAt: string;
  endAt: string;
  title: string;
  subtitle?: string;
  status: StatusKind;
}
export interface AgendaBlock {
  id: string;
  staffId: string | null;
  startAt: string;
  endAt: string;
  label: string;
}

export function AgendaGrid({
  staff,
  items,
  blocks,
  timeZone,
  startHour = 8,
  endHour = 20,
  showNow = true,
  onPressItem,
}: {
  staff: { id: string; displayName: string; colorIndex: number }[];
  items: AgendaItem[];
  blocks: AgendaBlock[];
  timeZone: string;
  startHour?: number;
  endHour?: number;
  showNow?: boolean;
  onPressItem?: (id: string) => void;
}) {
  const t = useTheme();
  const H = t.layout.agenda.hourHeight;
  const gutter = t.layout.agenda.timeGutter;
  const top = (iso: string) => ((localMinutesOf(new Date(iso), timeZone) - startHour * 60) / 60) * H;
  const height = (a: string, b: string) => ((new Date(b).getTime() - new Date(a).getTime()) / 3600000) * H;
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);
  const nowTop = top(now.toISOString());
  const hours = Array.from({ length: endHour - startHour }, (_, i) => startHour + i);
  const totalH = hours.length * H;

  return (
    <View style={{ backgroundColor: t.c.surface, borderRadius: t.radius.md, overflow: 'hidden' }}>
      {/* intestazione operatori */}
      <View style={{ flexDirection: 'row', paddingLeft: gutter, borderBottomWidth: 1, borderBottomColor: t.c.border }}>
        {staff.map((s) => (
          <View key={s.id} style={{ flex: 1, minWidth: 120, flexDirection: 'row', alignItems: 'center', gap: 8, height: 48, paddingHorizontal: 8 }}>
            <Avatar name={s.displayName} colorIndex={s.colorIndex} size={28} />
            <Text variant="headline" numberOfLines={1}>
              {s.displayName}
            </Text>
          </View>
        ))}
      </View>
      <ScrollView style={{ maxHeight: 640 }}>
        <View style={{ flexDirection: 'row', height: totalH }}>
          <View style={{ width: gutter }}>
            {hours.map((h) => (
              <Text key={h} variant="caption" tone="muted" numeric style={{ height: H, paddingLeft: 8, marginTop: -8 }}>
                {h === startHour ? '' : `${h}:00`}
              </Text>
            ))}
          </View>
          {staff.map((s) => {
            const ink = t.staff(s.colorIndex);
            return (
              <View key={s.id} style={{ flex: 1, minWidth: 120, borderLeftWidth: 1, borderLeftColor: t.c.border }} testID={`agenda-col-${s.id}`}>
                {hours.map((h) => (
                  <View key={h} style={{ position: 'absolute', top: (h - startHour) * H, left: 0, right: 0, height: 1, backgroundColor: t.c.border }} />
                ))}
                {blocks
                  .filter((b) => b.staffId === s.id || b.staffId === null)
                  .map((b) => (
                    <View
                      key={b.id}
                      style={{ position: 'absolute', left: 4, right: 4, top: top(b.startAt), height: height(b.startAt, b.endAt), borderRadius: t.radius.sm, backgroundColor: t.c.fill, padding: 6, opacity: 0.8 }}
                      accessibilityLabel={`${b.label}, ${formatTime(new Date(b.startAt), timeZone)}-${formatTime(new Date(b.endAt), timeZone)}`}
                    >
                      <Text variant="caption" tone="muted">
                        {b.label}
                      </Text>
                    </View>
                  ))}
                {items
                  .filter((a) => a.staffId === s.id && a.status !== 'cancelled')
                  .map((a) => {
                    const h = height(a.startAt, a.endAt);
                    const short = h < 44;
                    const time = `${formatTime(new Date(a.startAt), timeZone)}${short ? '' : `–${formatTime(new Date(a.endAt), timeZone)}`}`;
                    return (
                      <View
                        key={a.id}
                        testID={`appt-${a.id}`}
                        accessibilityLabel={`${time}, ${a.title}${a.subtitle ? `, ${a.subtitle}` : ''}, ${STATUS_LABEL[a.status]}`}
                        style={{
                          position: 'absolute',
                          left: 4,
                          right: 4,
                          top: top(a.startAt),
                          height: Math.max(h - 2, 20),
                          borderRadius: t.radius.sm,
                          backgroundColor: ink.bg,
                          borderLeftWidth: 3,
                          borderLeftColor: ink.ink,
                          paddingHorizontal: 8,
                          paddingVertical: short ? 3 : 6,
                          overflow: 'hidden',
                          opacity: a.status === 'completed' ? 0.6 : 1,
                          borderStyle: a.status === 'pending' ? 'dashed' : 'solid',
                          borderWidth: a.status === 'pending' ? 1.5 : 0,
                          borderColor: ink.ink,
                        }}
                      >
                        <Text variant="footnote" numeric numberOfLines={short ? 1 : 3} style={{ color: ink.ink }}>
                          <Text variant="footnote" style={{ color: ink.ink, fontWeight: '700' }}>
                            {time}{' '}
                          </Text>
                          {short ? a.title : `\n${a.title}${a.subtitle ? ` · ${a.subtitle}` : ''}`}
                        </Text>
                      </View>
                    );
                  })}
              </View>
            );
          })}
          {showNow && nowTop > 0 && nowTop < totalH ? (
            <View pointerEvents="none" style={{ position: 'absolute', left: gutter - 4, right: 0, top: nowTop, height: 2, backgroundColor: t.c.danger }} accessibilityLabel="Ora attuale" />
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

export function StatTile({ label, value, delta, deltaTone }: { label: string; value: string; delta?: string; deltaTone?: 'up' | 'down' | 'flat' }) {
  const t = useTheme();
  return (
    <View style={{ flex: 1, minWidth: 150, backgroundColor: t.c.surface, borderRadius: t.radius.md, padding: 16, gap: 2 }}>
      <Text variant="footnote" tone="muted">
        {label}
      </Text>
      <Text variant="largeTitle" numeric accessibilityLabel={`${label}: ${value}`}>
        {value}
      </Text>
      {delta ? (
        <Text variant="footnote" tone={deltaTone === 'up' ? 'success' : deltaTone === 'down' ? 'danger' : 'muted'}>
          {deltaTone === 'up' ? '▲ ' : deltaTone === 'down' ? '▼ ' : ''}
          {delta}
        </Text>
      ) : null}
    </View>
  );
}
