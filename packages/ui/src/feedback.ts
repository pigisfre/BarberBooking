/** Feedback aptico (tokens.json -> haptics): solo nei momenti che contano, nessun effetto sul web. */
import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

const native = Platform.OS === 'ios' || Platform.OS === 'android';
const safe = (fn: () => Promise<void>) => {
  if (!native) return;
  fn().catch(() => {});
};

export const haptics = {
  select: () => safe(() => Haptics.selectionAsync()),
  success: () => safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  warning: () => safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
  pickup: () => safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  drop: () => safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),
};
