/** Pagina segnaposto: dice cosa arriva e quando, invece di una pagina vuota. */
import { EmptyState, Screen, Text } from '@bb/ui';

export function ComingSoon({ title, screen, what }: { title: string; screen: string; what: string }) {
  return (
    <Screen maxWidth={900}>
      <Text variant="largeTitle" accessibilityRole="header">
        {title}
      </Text>
      <EmptyState title="In costruzione" message={`${what} (schermata ${screen}).`} />
    </Screen>
  );
}
