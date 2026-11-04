/** S06 scelta dell'operatore (si salta se c'e un solo operatore o il brand non usa lo staff multiplo). */
import { router } from 'expo-router';
import { useServices, useStaff } from '@bb/api';
import { Button, Screen, Skeleton, StaffPicker, Text } from '@bb/ui';
import { useBooking } from '@/booking-state';

export default function ChooseStaff() {
  const { draft, update } = useBooking();
  const staff = useStaff();
  const services = useServices();
  const chosen = (services.data ?? []).filter((s) => draft.serviceIds.includes(s.id));
  const eligible = (staff.data ?? []).filter((st) => chosen.every((s) => s.staffIds.includes(st.id)));

  return (
    <Screen footer={<Button size="lg" title="Continua" testID="continue-staff" onPress={() => router.push('/prenota/orario')} />}>
      <Text variant="subhead" tone="muted" style={{ marginBottom: 8 }}>
        Scegli chi preferisci, oppure il primo libero: ti mostriamo più orari.
      </Text>
      {staff.isLoading ? (
        <Skeleton height={120} />
      ) : (
        <StaffPicker staff={eligible} selected={draft.staffId} onSelect={(id) => update({ staffId: id, slot: null })} />
      )}
    </Screen>
  );
}
